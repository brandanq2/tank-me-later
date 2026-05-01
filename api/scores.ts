import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const HASH_KEY = 'tank-me-later:scores'

function charKey(name: string, realm: string, region: string) {
  return `${name}-${realm}-${region}`.toLowerCase()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { name, realm, region, score } = req.body as {
    name: string
    realm: string
    region: string
    score: number
  }

  const key = charKey(name, realm, region)
  const prev = await redis.hget<number>(HASH_KEY, key)
  const delta = prev != null ? Math.max(0, score - prev) : 0

  // Only update stored score if it increased (IO never decreases)
  if (prev == null || score > prev) {
    await redis.hset(HASH_KEY, { [key]: score })
  }

  return res.json({ delta })
}
