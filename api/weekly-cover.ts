import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export interface WeeklyCoverData {
  imageUrl: string | null
  weekNumber: number | null
  charKey: string | null
  charName: string | null
  score: number | null
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const data = await redis.get<WeeklyCoverData | string>('tank-me-later:weekly-cover')

  if (!data) {
    return res.json({ imageUrl: null, weekNumber: null, charKey: null, charName: null, score: null })
  }

  // Handle legacy format where only the URL string was stored
  if (typeof data === 'string') {
    return res.json({ imageUrl: data, weekNumber: null, charKey: null, charName: null, score: null })
  }

  return res.json(data)
}
