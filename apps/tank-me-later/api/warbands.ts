import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface CharacterInput {
  name: string
  realm: string
  region: string
}

interface StoredWarband {
  id: string
  name: string
  /** Every browser session allowed to edit the warband — one per device. */
  ownerSessionIds: string[]
  /** Shared secret an owner uses to add a new device to ownerSessionIds. */
  claimCode: string
  members: CharacterInput[]
  /** Pre-multi-owner records held a single id; migrated away on first read. */
  ownerSessionId?: string
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const KEY = 'tank-me-later:warbands'
const CLAIM_ATTEMPTS_PREFIX = 'tank-me-later:claim-attempts'
const CLAIM_ATTEMPT_WINDOW_SECONDS = 600
const MAX_CLAIM_ATTEMPTS = 20

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// No O/0/I/1/L — codes get read aloud in Discord and retyped by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function makeClaimCode(): string {
  const block = () => Array.from(
    { length: 4 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('')
  return `${block()}-${block()}`
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Warbands created before claim codes existed carried a single ownerSessionId
// and no code at all. Upgrade them in place so recovery works for old data too.
function migrate(warband: StoredWarband): { warband: StoredWarband; changed: boolean } {
  const next = { ...warband }
  let changed = false
  if (!Array.isArray(next.ownerSessionIds)) {
    next.ownerSessionIds = next.ownerSessionId ? [next.ownerSessionId] : []
    changed = true
  }
  if (next.ownerSessionId !== undefined) {
    delete next.ownerSessionId
    changed = true
  }
  if (!next.claimCode) {
    next.claimCode = makeClaimCode()
    changed = true
  }
  return { warband: next, changed }
}

async function loadWarbands(): Promise<StoredWarband[]> {
  const stored = await redis.get<StoredWarband[]>(KEY) ?? []
  const migrated = stored.map(migrate)
  if (migrated.some(m => m.changed)) {
    await redis.set(KEY, migrated.map(m => m.warband))
  }
  return migrated.map(m => m.warband)
}

function isOwner(warband: StoredWarband, sessionId?: string): boolean {
  return !!sessionId && warband.ownerSessionIds.includes(sessionId)
}

// Session ids never leave the server, and the claim code only goes to owners —
// otherwise knowing a warband's secret would be as easy as loading the page.
function publicView(warband: StoredWarband, sessionId?: string) {
  const owner = isOwner(warband, sessionId)
  return {
    id: warband.id,
    name: warband.name,
    members: warband.members,
    isOwner: owner,
    ...(owner ? { claimCode: warband.claimCode } : {}),
  }
}

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return raw?.split(',')[0]?.trim() || 'unknown'
}

/** Returns true when the caller has burned through its claim attempts. */
async function claimRateLimited(req: VercelRequest): Promise<boolean> {
  const key = `${CLAIM_ATTEMPTS_PREFIX}:${clientIp(req)}`
  const attempts = await redis.incr(key)
  if (attempts === 1) await redis.expire(key, CLAIM_ATTEMPT_WINDOW_SECONDS)
  return attempts > MAX_CLAIM_ATTEMPTS
}

async function handleClaim(req: VercelRequest, res: VercelResponse) {
  const { id, code, sessionId } = req.body as Partial<{
    id: string
    code: string
    sessionId: string
  }>
  if (!id || !code?.trim() || !sessionId) {
    return res.status(400).json({ error: 'id, code and sessionId required' })
  }
  if (await claimRateLimited(req)) {
    return res.status(429).json({ error: 'Too many attempts — try again later' })
  }

  const warbands = await loadWarbands()
  const idx = warbands.findIndex(w => w.id === id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  if (normalizeCode(warbands[idx].claimCode) !== normalizeCode(code)) {
    return res.status(403).json({ error: 'That access code does not match' })
  }

  // Claiming adds a device rather than transferring, so the owner keeps access
  // from every machine they have already claimed on.
  if (!warbands[idx].ownerSessionIds.includes(sessionId)) {
    warbands[idx] = {
      ...warbands[idx],
      ownerSessionIds: [...warbands[idx].ownerSessionIds, sessionId],
    }
    await redis.set(KEY, warbands)
  }
  return res.json(publicView(warbands[idx], sessionId))
}

/** Admin-only code listing, so a locked-out owner can be handed their code. */
async function handleCodeLookup(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const warbands = await loadWarbands()
  return res.json(warbands.map(w => ({
    id: w.id,
    name: w.name,
    claimCode: w.claimCode,
    owners: w.ownerSessionIds.length,
  })))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { action } = req.query as { action?: string }

  if (req.method === 'GET') {
    if (action === 'codes') return handleCodeLookup(req, res)
    const { session } = req.query as { session?: string }
    const warbands = await loadWarbands()
    return res.json(warbands.map(w => publicView(w, session)))
  }

  if (req.method === 'POST') {
    if (action === 'claim') return handleClaim(req, res)

    // `ownerSessionId` is the pre-claim-code field name, still accepted so a
    // cached bundle can keep creating warbands after this deploy.
    const { name, members, sessionId, ownerSessionId } = req.body as Partial<{
      name: string
      members: CharacterInput[]
      sessionId: string
      ownerSessionId: string
    }>
    const owner = sessionId ?? ownerSessionId
    if (!name?.trim() || !owner) {
      return res.status(400).json({ error: 'name and sessionId required' })
    }
    const warbands = await loadWarbands()
    const created: StoredWarband = {
      id: makeId(),
      name: name.trim(),
      ownerSessionIds: [owner],
      claimCode: makeClaimCode(),
      members: members ?? [],
    }
    await redis.set(KEY, [...warbands, created])
    return res.status(201).json(publicView(created, owner))
  }

  if (req.method === 'PUT') {
    const { id } = req.query as { id?: string }
    const { members, sessionId, ownerSessionId } = req.body as Partial<{
      members: CharacterInput[]
      sessionId: string
      ownerSessionId: string
    }>
    const session = sessionId ?? ownerSessionId
    if (!id) return res.status(400).json({ error: 'id required' })
    const warbands = await loadWarbands()
    const idx = warbands.findIndex(w => w.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    if (!isOwner(warbands[idx], session)) return res.status(403).json({ error: 'Forbidden' })
    warbands[idx] = { ...warbands[idx], members: members ?? [] }
    await redis.set(KEY, warbands)
    return res.json(publicView(warbands[idx], session))
  }

  if (req.method === 'DELETE') {
    const { id, session } = req.query as { id?: string; session?: string }
    if (!id) return res.status(400).json({ error: 'id required' })
    const warbands = await loadWarbands()
    const target = warbands.find(w => w.id === id)
    if (!target) return res.status(404).json({ error: 'Not found' })
    if (!isOwner(target, session)) return res.status(403).json({ error: 'Forbidden' })
    await redis.set(KEY, warbands.filter(w => w.id !== id))
    return res.json({ deleted: id })
  }

  return res.status(405).end()
}
