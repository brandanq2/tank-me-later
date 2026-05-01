import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const params = new URLSearchParams(req.query as Record<string, string>)
  const upstream = await fetch(`https://raider.io/api/v1/characters/profile?${params}`)
  const data = await upstream.json()
  return res.status(upstream.status).json(data)
}
