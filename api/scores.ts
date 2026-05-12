import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

function charKey(name: string, realm: string, region: string) {
  return `${name}-${realm}-${region}`.toLowerCase()
}

function easternDate(d: Date): string {
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const LIST_PREFIXES: Record<string, string> = {
  tanks: 'tank-me-later',
  open:  'tank-me-later:open',
  augs:  'tank-me-later:augs',
}

function dailyKey(prefix: string, dateStr: string) {
  return `${prefix}:daily:${dateStr}`
}

function rankKey(prefix: string, dateStr: string) {
  return `${prefix}:daily-rank:${dateStr}`
}

function todayEastern(): string {
  return easternDate(new Date())
}

function yesterdayEastern(): string {
  return easternDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { name, realm, region, score, list } = req.body as {
    name: string
    realm: string
    region: string
    score: number
    list?: string
  }

  const prefix = LIST_PREFIXES[list ?? 'tanks'] ?? LIST_PREFIXES.tanks
  const cKey = charKey(name, realm, region)

  // Baseline is the snapshot taken at the start of today (cron at 05:00 UTC).
  // Fall back to yesterday's snapshot in the small window before today's cron has fired.
  const tDate = todayEastern()
  const yDate = yesterdayEastern()
  const [todayScore, todayRank, yScore, yRank] = await Promise.all([
    redis.hget<number>(dailyKey(prefix, tDate), cKey),
    redis.hget<number>(rankKey(prefix, tDate), cKey),
    redis.hget<number>(dailyKey(prefix, yDate), cKey),
    redis.hget<number>(rankKey(prefix, yDate), cKey),
  ])

  const prevScore = todayScore ?? yScore
  const prevRank = todayRank ?? yRank
  const delta = prevScore != null ? Math.max(0, score - prevScore) : 0

  return res.json({ delta, prevRank: prevRank ?? null })
}
