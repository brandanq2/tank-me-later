import { neon } from '@neondatabase/serverless'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function getDb() {
  return neon(process.env.DATABASE_URL!)
}

function charKey(name: string, realm: string, region: string) {
  return `${name}-${realm}-${region}`.toLowerCase()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { name, realm, region } = req.query as { name?: string; realm?: string; region?: string }
  if (!name || !realm || !region) return res.status(400).end()

  const sql = getDb()
  const cKey = charKey(name, realm, region)

  const rows = await sql`
    SELECT snapped_on::text AS date, score::float AS score
    FROM score_history
    WHERE char_key = ${cKey}
    ORDER BY snapped_on ASC
  `

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
  return res.json(rows)
}
