import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const PREFIX = 'tank-me-later:warband-daily'
const TTL = 60 * 60 * 24 * 7

function easternDate(d: Date): string {
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function todayEastern(): string {
  return easternDate(new Date())
}

function yesterdayEastern(): string {
  return easternDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { warbandId, score } = req.body as { warbandId?: string; score?: number }
  if (!warbandId || typeof score !== 'number') {
    return res.status(400).json({ error: 'warbandId and score required' })
  }

  const yKey = `${PREFIX}:${yesterdayEastern()}`
  const tKey = `${PREFIX}:${todayEastern()}`

  const prevScore = await redis.hget<number>(yKey, warbandId)
  await redis.hset(tKey, { [warbandId]: score })
  await redis.expire(tKey, TTL)

  const delta = prevScore != null ? Math.max(0, score - prevScore) : 0
  return res.json({ delta })
}
