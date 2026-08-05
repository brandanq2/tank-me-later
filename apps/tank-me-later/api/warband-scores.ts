import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const PREFIX = 'tank-me-later:warband-daily'

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

  // Baseline is the snapshot taken at the start of today (cron at 05:00 UTC).
  // Fall back to yesterday's snapshot in the small window before today's cron has fired.
  let baseline = await redis.hget<number>(`${PREFIX}:${todayEastern()}`, warbandId)
  if (baseline == null) {
    baseline = await redis.hget<number>(`${PREFIX}:${yesterdayEastern()}`, warbandId)
  }
  const delta = baseline != null ? Math.max(0, score - baseline) : 0
  return res.json({ delta })
}
