import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@vercel/edge-config'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!process.env.EDGE_CONFIG) {
    return res.status(200).json({})
  }

  try {
    const client = createClient(process.env.EDGE_CONFIG)
    const flags = await client.getAll()
    return res.status(200).json(flags ?? {})
  } catch {
    return res.status(200).json({})
  }
}
