import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface CharacterInput {
  name: string
  realm: string
  region: string
}

interface WarbandDefinition {
  id: string
  name: string
  ownerSessionId: string
  members: CharacterInput[]
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const KEY = 'tank-me-later:warbands'

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method === 'GET') {
    const warbands = await redis.get<WarbandDefinition[]>(KEY) ?? []
    return res.json(warbands)
  }

  if (req.method === 'POST') {
    const { name, members, ownerSessionId } = req.body as Partial<{
      name: string
      members: CharacterInput[]
      ownerSessionId: string
    }>
    if (!name?.trim() || !ownerSessionId) {
      return res.status(400).json({ error: 'name and ownerSessionId required' })
    }
    const warbands = await redis.get<WarbandDefinition[]>(KEY) ?? []
    const created: WarbandDefinition = {
      id: makeId(),
      name: name.trim(),
      ownerSessionId,
      members: members ?? [],
    }
    await redis.set(KEY, [...warbands, created])
    return res.status(201).json(created)
  }

  if (req.method === 'PUT') {
    const { id } = req.query as { id?: string }
    const { members, ownerSessionId } = req.body as Partial<{
      members: CharacterInput[]
      ownerSessionId: string
    }>
    if (!id) return res.status(400).json({ error: 'id required' })
    const warbands = await redis.get<WarbandDefinition[]>(KEY) ?? []
    const idx = warbands.findIndex(w => w.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    if (warbands[idx].ownerSessionId !== ownerSessionId) return res.status(403).json({ error: 'Forbidden' })
    warbands[idx] = { ...warbands[idx], members: members ?? [] }
    await redis.set(KEY, warbands)
    return res.json(warbands[idx])
  }

  if (req.method === 'DELETE') {
    const { id, session } = req.query as { id?: string; session?: string }
    if (!id) return res.status(400).json({ error: 'id required' })
    const warbands = await redis.get<WarbandDefinition[]>(KEY) ?? []
    const target = warbands.find(w => w.id === id)
    if (!target) return res.status(404).json({ error: 'Not found' })
    if (target.ownerSessionId !== session) return res.status(403).json({ error: 'Forbidden' })
    await redis.set(KEY, warbands.filter(w => w.id !== id))
    return res.json({ deleted: id })
  }

  return res.status(405).end()
}
