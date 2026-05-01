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

function dailyKeysKey(date: Date) {
  return `tank-me-later:daily-keys:${date.toISOString().slice(0, 10)}`
}

function yesterday() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { name, realm, region, score, keys = {} } = req.body as {
    name: string
    realm: string
    region: string
    score: number
    keys: Record<string, number>
  }

  const cKey = charKey(name, realm, region)
  const yday = yesterday()

  const [prevScore, prevKeysRaw] = await Promise.all([
    redis.hget<number>(dailyKey(yday), cKey),
    redis.hget<string>(dailyKeysKey(yday), cKey),
  ])

  const delta = prevScore != null ? Math.max(0, score - prevScore) : 0

  const prevKeys: Record<string, number> = prevKeysRaw
    ? (typeof prevKeysRaw === 'string' ? JSON.parse(prevKeysRaw) : prevKeysRaw)
    : {}

  const keyDeltas: Record<string, number> = {}
  for (const [shortName, level] of Object.entries(keys)) {
    const prev = prevKeys[shortName]
    if (prev != null) keyDeltas[shortName] = Math.max(0, level - prev)
  }

  return res.json({ delta, keyDeltas })
}
