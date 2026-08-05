import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface CharacterInput {
  name: string
  realm: string
  region: string
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const KEYS: Record<string, string> = {
  tanks: 'tank-me-later:characters',
  augs:  'tank-me-later:characters:augs',
  open:  'tank-me-later:characters:open',
}

function listKey(req: VercelRequest): string {
  const list = req.query.list as string
  return KEYS[list] ?? KEYS.tanks
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method === 'GET') {
    const chars = await redis.get<CharacterInput[]>(listKey(req)) ?? []
    return res.json(chars)
  }

  if (req.method === 'POST') {
    const input = req.body as CharacterInput
    if (!input.name?.trim() || !input.realm?.trim()) {
      return res.status(400).json({ error: 'Name and realm are required' })
    }
    const key = listKey(req)
    const chars = await redis.get<CharacterInput[]>(key) ?? []
    const charId = `${input.name}-${input.realm}-${input.region}`.toLowerCase()
    const isDupe = chars.some(
      (c) => `${c.name}-${c.realm}-${c.region}`.toLowerCase() === charId
    )
    if (isDupe) return res.status(409).json({ error: 'Already exists' })
    await redis.set(key, [...chars, input])
    return res.status(201).json(input)
  }

  if (req.method === 'DELETE') {
    const { name, realm, region } = req.query as Record<string, string>
    const key = listKey(req)
    const chars = await redis.get<CharacterInput[]>(key) ?? []
    const updated = chars.filter(
      (c) => !(
        c.name.toLowerCase() === name?.toLowerCase() &&
        c.realm.toLowerCase() === realm?.toLowerCase() &&
        c.region.toLowerCase() === region?.toLowerCase()
      )
    )
    await redis.set(key, updated)
    return res.json(updated)
  }

  return res.status(405).end()
}
