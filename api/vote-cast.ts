import { createHash } from 'crypto'
import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const VOTES_NEEDED = 3
const ACTIVE_SET_KEY = 'tank-me-later:votes:active'
const CHARS_KEY = 'tank-me-later:characters'

interface VoteRecord {
  charKey: string
  name: string
  realm: string
  region: string
  className?: string
  specName?: string
  thumbnailUrl?: string
  yesVotes: string[]
  noVotes: string[]
  ipHashes: string[]
  expiresAt: number
  failed?: boolean
}

function clientIpHash(req: VercelRequest): string | null {
  const fwd = req.headers['x-forwarded-for']
  const raw = Array.isArray(fwd) ? fwd[0] : fwd
  const ip = raw?.split(',')[0].trim()
  if (!ip) return null
  return createHash('sha256').update(`tml:vote:${ip}`).digest('hex').slice(0, 16)
}

interface CharacterInput {
  name: string
  realm: string
  region: string
}

function voteKey(charKey: string) {
  return `tank-me-later:vote:${charKey}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { charKey, vote, sessionId } = req.body as { charKey: string; vote: 'yes' | 'no'; sessionId: string }

  const record = await redis.get<VoteRecord>(voteKey(charKey))
  if (!record) return res.status(404).json({ error: 'Vote not found' })

  const ipHash = clientIpHash(req)
  const ipHashes = record.ipHashes ?? []

  if (
    record.yesVotes.includes(sessionId) || record.noVotes.includes(sessionId) ||
    (ipHash !== null && ipHashes.includes(ipHash))
  ) {
    return res.status(409).json({ error: 'Already voted' })
  }

  if (vote === 'yes') {
    record.yesVotes.push(sessionId)
  } else {
    record.noVotes.push(sessionId)
  }
  record.ipHashes = ipHash ? [...ipHashes, ipHash] : ipHashes

  if (record.noVotes.length >= VOTES_NEEDED) {
    record.failed = true
    const ttlRemaining = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000))
    await redis.set(voteKey(charKey), record, { ex: ttlRemaining })
    return res.json(record)
  }

  if (record.yesVotes.length >= VOTES_NEEDED) {
    const chars = await redis.get<CharacterInput[]>(CHARS_KEY) ?? []
    await redis.set(CHARS_KEY, chars.filter(
      c => `${c.name}-${c.realm}-${c.region}`.toLowerCase() !== charKey
    ))
    await redis.del(voteKey(charKey))
    await redis.srem(ACTIVE_SET_KEY, charKey)
    return res.json({ ...record, resolved: true })
  }

  const ttlRemaining = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000))
  await redis.set(voteKey(charKey), record, { ex: ttlRemaining })
  return res.json(record)
}
