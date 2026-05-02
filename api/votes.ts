import { createHash } from 'crypto'
import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const VOTE_TTL = 60 * 60 * 24
const VOTES_NEEDED = 3
const ACTIVE_SET_KEY = 'tank-me-later:votes:active'

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

function voteKey(charKey: string) {
  return `tank-me-later:vote:${charKey}`
}

function clientIpHash(req: VercelRequest): string | null {
  const fwd = req.headers['x-forwarded-for']
  const raw = Array.isArray(fwd) ? fwd[0] : fwd
  const ip = raw?.split(',')[0].trim()
  if (!ip) return null
  return createHash('sha256').update(`tml:vote:${ip}`).digest('hex').slice(0, 16)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const activeKeys = await redis.smembers(ACTIVE_SET_KEY) as string[]
    if (activeKeys.length === 0) return res.json([])
    const votes = await Promise.all(
      activeKeys.map(async (k) => {
        const vote = await redis.get<VoteRecord>(voteKey(k))
        if (!vote) { await redis.srem(ACTIVE_SET_KEY, k); return null }
        if (!vote.failed && vote.noVotes.length >= VOTES_NEEDED) {
          vote.failed = true
          const ttlRemaining = Math.max(1, Math.ceil((vote.expiresAt - Date.now()) / 1000))
          await redis.set(voteKey(k), vote, { ex: ttlRemaining })
        }
        return vote
      })
    )
    return res.json(votes.filter(Boolean))
  }

  if (req.method === 'POST') {
    const { charKey, name, realm, region, className, specName, thumbnailUrl, sessionId } = req.body as VoteRecord & { sessionId: string }
    const existing = await redis.get(voteKey(charKey))
    if (existing) return res.status(409).json({ error: 'Vote already active' })

    const ipHash = clientIpHash(req)
    const vote: VoteRecord = {
      charKey, name, realm, region, className, specName, thumbnailUrl,
      yesVotes: [sessionId],
      noVotes: [],
      ipHashes: ipHash ? [ipHash] : [],
      expiresAt: Date.now() + VOTE_TTL * 1000,
    }
    await redis.set(voteKey(charKey), vote, { ex: VOTE_TTL })
    await redis.sadd(ACTIVE_SET_KEY, charKey)
    return res.status(201).json(vote)
  }

  return res.status(405).end()
}
