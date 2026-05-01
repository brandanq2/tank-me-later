import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface CharacterInput {
  name: string
  realm: string
  region: string
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const KEY = 'tank-me-later:characters'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method === 'GET') {
    const chars = await redis.get<CharacterInput[]>(KEY) ?? []
    return res.json(chars)
  }

  if (req.method === 'POST') {
    const input = req.body as CharacterInput
    const chars = await redis.get<CharacterInput[]>(KEY) ?? []
    const key = `${input.name}-${input.realm}-${input.region}`.toLowerCase()
    const isDupe = chars.some(
      (c) => `${c.name}-${c.realm}-${c.region}`.toLowerCase() === key
    )
    if (isDupe) return res.status(409).json({ error: 'Already exists' })
    await redis.set(KEY, [...chars, input])
    return res.status(201).json(input)
  }

  if (req.method === 'DELETE') {
    const { name, realm, region } = req.query as Record<string, string>
    const chars = await redis.get<CharacterInput[]>(KEY) ?? []
    const updated = chars.filter(
      (c) => !(
        c.name.toLowerCase() === name?.toLowerCase() &&
        c.realm.toLowerCase() === realm?.toLowerCase() &&
        c.region.toLowerCase() === region?.toLowerCase()
      )
    )
    await redis.set(KEY, updated)
    return res.json(updated)
  }

  return res.status(405).end()
}
