import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

function charKey(name: string, realm: string, region: string) {
  return `${name}-${realm}-${region}`.toLowerCase()
}

function dailyKey(date: Date) {
  return `tank-me-later:daily:${date.toISOString().slice(0, 10)}`
}

function rankKey(date: Date) {
  return `tank-me-later:daily-rank:${date.toISOString().slice(0, 10)}`
}

function yesterday() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d
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
  const yKey = yesterday()
  const [prevScore, prevRank] = await Promise.all([
    redis.hget<number>(dailyKey(yKey), cKey),
    redis.hget<number>(rankKey(yKey), cKey),
  ])
  const delta = prevScore != null ? Math.max(0, score - prevScore) : 0

  return res.json({ delta, prevRank: prevRank ?? null })
}
