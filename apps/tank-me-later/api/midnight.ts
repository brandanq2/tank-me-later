import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Invite-only Midnight heroic raid team: weekly availability, the locked-in
 * raid slot, and per-warband signups.
 *
 * Access is a shared invite code held in env, checked on every request — there
 * is no token to mint or expire, the client just keeps sending the code it was
 * given. `MIDNIGHT_ORGANIZER_CODE` additionally unlocks locking/clearing the
 * raid slot. With no `MIDNIGHT_INVITE_CODE` set the page is closed rather than
 * open, so a missing env var can never expose the roster.
 */

/** Roster sections. Mirrors RaidRole in src/midnight/specs.ts. */
type Role = 'tank' | 'healer' | 'melee' | 'ranged'

interface CharacterInput {
  name: string
  realm: string
  region: string
}

interface AvailabilityRecord {
  warbandId: string
  slots: string[]
  note?: string
  updatedAt: number
}

interface RaidSlotRecord {
  id: string
  day: string
  /** Minutes past midnight, so a stored slot survives grid-range changes. */
  startMinutes: number
  lockedAt: number
}

interface SignupRecord {
  warbandId: string
  character: CharacterInput
  className: string
  specName: string
  role: Role
  note?: string
  signedUpAt: number
}

/** Only the fields this route needs — warbands.ts owns the full shape. */
interface StoredWarband {
  id: string
  name: string
  ownerSessionIds?: string[]
  ownerSessionId?: string
  members: CharacterInput[]
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const WARBANDS_KEY = 'tank-me-later:warbands'
const AVAILABILITY_KEY = 'tank-me-later:midnight:availability'
const RAID_SLOT_KEY = 'tank-me-later:midnight:raid-slot'
const SIGNUPS_KEY = 'tank-me-later:midnight:signups'
const UNLOCK_ATTEMPTS_PREFIX = 'tank-me-later:midnight:unlock-attempts'
const UNLOCK_ATTEMPT_WINDOW_SECONDS = 600
const MAX_UNLOCK_ATTEMPTS = 30

// Mirrors src/midnight/schedule.ts. Duplicated because api/ functions are
// self-contained here; keep the two in sync if the grid ever changes shape.
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const GRID_START_MINUTES = 14 * 60
const GRID_END_MINUTES = 25 * 60
const BLOCK_MINUTES = 30
const BLOCKS_PER_DAY = (GRID_END_MINUTES - GRID_START_MINUTES) / BLOCK_MINUTES
const RAID_BLOCKS = 6
const ROLES: Role[] = ['tank', 'healer', 'melee', 'ranged']

function normalizeCode(code: string): string {
  return code.trim().toLowerCase()
}

function presentedCode(req: VercelRequest): string {
  const header = req.headers['x-midnight-code']
  const fromHeader = Array.isArray(header) ? header[0] : header
  if (fromHeader) return fromHeader
  const { code } = req.query as { code?: string }
  if (code) return code
  const body = req.body as { code?: string } | undefined
  return body?.code ?? ''
}

/** null when the code does not match anything — callers turn that into a 403. */
function accessRole(req: VercelRequest): 'member' | 'organizer' | null {
  const invite = process.env.MIDNIGHT_INVITE_CODE
  const organizer = process.env.MIDNIGHT_ORGANIZER_CODE
  const presented = normalizeCode(presentedCode(req))
  if (!presented) return null
  if (organizer && presented === normalizeCode(organizer)) return 'organizer'
  if (invite && presented === normalizeCode(invite)) return 'member'
  return null
}

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return raw?.split(',')[0]?.trim() || 'unknown'
}

/** Returns true when the caller has burned through its unlock attempts. */
async function unlockRateLimited(req: VercelRequest): Promise<boolean> {
  const key = `${UNLOCK_ATTEMPTS_PREFIX}:${clientIp(req)}`
  const attempts = await redis.incr(key)
  if (attempts === 1) await redis.expire(key, UNLOCK_ATTEMPT_WINDOW_SECONDS)
  return attempts > MAX_UNLOCK_ATTEMPTS
}

function ownerIds(warband: StoredWarband): string[] {
  if (Array.isArray(warband.ownerSessionIds)) return warband.ownerSessionIds
  return warband.ownerSessionId ? [warband.ownerSessionId] : []
}

/**
 * Resolves the warband only when this session owns it — everything a player
 * writes is scoped to a warband they can already edit on the CLB page.
 */
async function ownedWarband(
  warbandId?: string,
  sessionId?: string,
): Promise<StoredWarband | null> {
  if (!warbandId || !sessionId) return null
  const warbands = await redis.get<StoredWarband[]>(WARBANDS_KEY) ?? []
  const warband = warbands.find(w => w.id === warbandId)
  if (!warband) return null
  return ownerIds(warband).includes(sessionId) ? warband : null
}

/** Cell keys carry the wall-clock minute, e.g. `wed:1230` for 8:30 PM. */
function isCellKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const [day, rawMinutes] = value.split(':')
  if (!DAYS.includes(day)) return false
  const minutes = Number(rawMinutes)
  if (!Number.isInteger(minutes)) return false
  const offset = minutes - GRID_START_MINUTES
  if (offset < 0 || offset % BLOCK_MINUTES !== 0) return false
  return offset / BLOCK_MINUTES < BLOCKS_PER_DAY
}

function sameCharacter(a: CharacterInput, b: CharacterInput): boolean {
  const key = (c: CharacterInput) =>
    `${c.name.toLowerCase()}-${c.realm.toLowerCase().replace(/[^a-z0-9]/g, '')}-${c.region.toLowerCase()}`
  return key(a) === key(b)
}

async function loadAvailability(): Promise<Record<string, AvailabilityRecord>> {
  return await redis.get<Record<string, AvailabilityRecord>>(AVAILABILITY_KEY) ?? {}
}

async function loadSignups(): Promise<Record<string, Record<string, SignupRecord>>> {
  return await redis.get<Record<string, Record<string, SignupRecord>>>(SIGNUPS_KEY) ?? {}
}

async function handleUnlock(req: VercelRequest, res: VercelResponse) {
  if (await unlockRateLimited(req)) {
    return res.status(429).json({ error: 'Too many attempts — try again later' })
  }
  const role = accessRole(req)
  if (!role) return res.status(403).json({ error: 'That invite code is not valid' })
  return res.json({ role })
}

/** The whole page in one read — availability, the locked slot, and signups. */
async function handleState(role: 'member' | 'organizer', res: VercelResponse) {
  const [availability, raidSlot, signups] = await Promise.all([
    loadAvailability(),
    redis.get<RaidSlotRecord | null>(RAID_SLOT_KEY),
    loadSignups(),
  ])

  return res.json({
    role,
    availability: Object.values(availability),
    raidSlot: raidSlot ?? null,
    signups: raidSlot ? Object.values(signups[raidSlot.id] ?? {}) : [],
  })
}

async function handleAvailability(req: VercelRequest, res: VercelResponse) {
  const { warbandId, sessionId, slots, note } = req.body as Partial<{
    warbandId: string
    sessionId: string
    slots: unknown[]
    note: string
  }>

  const warband = await ownedWarband(warbandId, sessionId)
  if (!warband) return res.status(403).json({ error: 'You do not own that warband' })
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots must be an array' })

  // Dedupe and drop anything outside the grid so one stale client cannot
  // poison the calendar with keys nothing else understands.
  const clean = [...new Set(slots.filter(isCellKey))].sort()
  const record: AvailabilityRecord = {
    warbandId: warband.id,
    slots: clean,
    ...(note?.trim() ? { note: note.trim().slice(0, 280) } : {}),
    updatedAt: Date.now(),
  }

  const availability = await loadAvailability()
  await redis.set(AVAILABILITY_KEY, { ...availability, [warband.id]: record })
  return res.json(record)
}

async function handleRaidSlot(req: VercelRequest, res: VercelResponse) {
  const { day, startMinutes } = req.body as Partial<{ day: string; startMinutes: number }>
  if (!day || !DAYS.includes(day)) return res.status(400).json({ error: 'invalid day' })
  if (!Number.isInteger(startMinutes)) {
    return res.status(400).json({ error: 'invalid startMinutes' })
  }
  const offset = startMinutes! - GRID_START_MINUTES
  // Must land on a half-hour boundary and leave room for the full three hours.
  if (
    offset < 0 ||
    offset % BLOCK_MINUTES !== 0 ||
    startMinutes! + RAID_BLOCKS * BLOCK_MINUTES > GRID_END_MINUTES
  ) {
    return res.status(400).json({ error: 'invalid startMinutes' })
  }

  const record: RaidSlotRecord = {
    id: `${day}:${startMinutes}`,
    day,
    startMinutes: startMinutes!,
    lockedAt: Date.now(),
  }
  await redis.set(RAID_SLOT_KEY, record)
  return res.json(record)
}

async function handleSignup(req: VercelRequest, res: VercelResponse) {
  const { warbandId, sessionId, character, className, specName, role, note } = req.body as Partial<{
    warbandId: string
    sessionId: string
    character: CharacterInput
    className: string
    specName: string
    role: Role
    note: string
  }>

  const raidSlot = await redis.get<RaidSlotRecord | null>(RAID_SLOT_KEY)
  if (!raidSlot) return res.status(409).json({ error: 'No raid slot has been locked in yet' })

  const warband = await ownedWarband(warbandId, sessionId)
  if (!warband) return res.status(403).json({ error: 'You do not own that warband' })
  if (!character?.name || !character.realm || !character.region) {
    return res.status(400).json({ error: 'character required' })
  }
  if (!warband.members.some(m => sameCharacter(m, character))) {
    return res.status(400).json({ error: 'That character is not in your warband' })
  }
  if (!className?.trim() || !specName?.trim()) {
    return res.status(400).json({ error: 'className and specName required' })
  }
  // The class/spec pair is not re-validated here — the client picks it from a
  // fixed list, and `role` is what the roster actually groups on.
  if (!role || !ROLES.includes(role)) return res.status(400).json({ error: 'invalid role' })

  const record: SignupRecord = {
    warbandId: warband.id,
    character,
    className: className.trim().slice(0, 40),
    specName: specName.trim().slice(0, 40),
    role,
    ...(note?.trim() ? { note: note.trim().slice(0, 280) } : {}),
    signedUpAt: Date.now(),
  }

  // One character per warband per slot — re-signing swaps the character
  // instead of stacking a second entry.
  const signups = await loadSignups()
  await redis.set(SIGNUPS_KEY, {
    ...signups,
    [raidSlot.id]: { ...(signups[raidSlot.id] ?? {}), [warband.id]: record },
  })
  return res.json(record)
}

async function handleWithdraw(req: VercelRequest, res: VercelResponse) {
  const { warbandId, session } = req.query as { warbandId?: string; session?: string }

  const raidSlot = await redis.get<RaidSlotRecord | null>(RAID_SLOT_KEY)
  if (!raidSlot) return res.status(409).json({ error: 'No raid slot has been locked in yet' })

  const warband = await ownedWarband(warbandId, session)
  if (!warband) return res.status(403).json({ error: 'You do not own that warband' })

  const signups = await loadSignups()
  const forSlot = { ...(signups[raidSlot.id] ?? {}) }
  delete forSlot[warband.id]
  await redis.set(SIGNUPS_KEY, { ...signups, [raidSlot.id]: forSlot })
  return res.json({ withdrawn: warband.id })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Midnight-Code')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { action } = req.query as { action?: string }

  // Unlock is the one route that runs before access is established.
  if (req.method === 'POST' && action === 'unlock') return handleUnlock(req, res)

  const role = accessRole(req)
  if (!role) return res.status(403).json({ error: 'Invite only' })

  if (req.method === 'GET') return handleState(role, res)

  if (req.method === 'PUT') {
    if (action === 'availability') return handleAvailability(req, res)
    if (action === 'signup') return handleSignup(req, res)
    if (action === 'raid-slot') {
      if (role !== 'organizer') return res.status(403).json({ error: 'Organizers only' })
      return handleRaidSlot(req, res)
    }
    return res.status(400).json({ error: 'unknown action' })
  }

  if (req.method === 'DELETE') {
    if (action === 'signup') return handleWithdraw(req, res)
    if (action === 'raid-slot') {
      if (role !== 'organizer') return res.status(403).json({ error: 'Organizers only' })
      await redis.del(RAID_SLOT_KEY)
      return res.json({ cleared: true })
    }
    return res.status(400).json({ error: 'unknown action' })
  }

  return res.status(405).end()
}
