import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const REDIS_KEY = 'tank-me-later:solo-queue-mapping'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const mapping = await redis.get<Record<string, unknown>>(REDIS_KEY)

  if (!mapping) {
    return res.status(200).json({ ranks: [] })
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json(mapping)
}
