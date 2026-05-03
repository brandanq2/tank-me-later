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

function dailyKey(dateStr: string) {
  return `tank-me-later:daily:${dateStr}`
}

function rankKey(dateStr: string) {
  return `tank-me-later:daily-rank:${dateStr}`
}

function yesterdayEastern(): string {
  return easternDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { name, realm, region, score } = req.body as {
    name: string
    realm: string
    region: string
    score: number
  }

  const cKey = charKey(name, realm, region)
  const yDate = yesterdayEastern()
  const [prevScore, prevRank] = await Promise.all([
    redis.hget<number>(dailyKey(yDate), cKey),
    redis.hget<number>(rankKey(yDate), cKey),
  ])

  const delta = prevScore != null ? Math.max(0, score - prevScore) : 0

  return res.json({ delta, prevRank: prevRank ?? null })
}
