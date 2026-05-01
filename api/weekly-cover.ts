import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const imageUrl = await redis.get<string>('tank-me-later:weekly-cover')
  return res.json({ imageUrl: imageUrl ?? null })
}
