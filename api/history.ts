import { Redis } from '@upstash/redis'
import { neon } from '@neondatabase/serverless'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

function getDb() {
  return neon(process.env.DATABASE_URL!)
}

function dailyKey(dateStr: string) {
  return `tank-me-later:daily:${dateStr}`
}

function charKey(name: string, realm: string, region: string) {
  return `${name}-${realm}-${region}`.toLowerCase()
}

function pastDates(days: number): string[] {
  const dates: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { name, realm, region } = req.query as { name?: string; realm?: string; region?: string }
  if (!name || !realm || !region) return res.status(400).end()

  const cKey = charKey(name, realm, region)
  const dates = pastDates(7)

  const pipe = redis.pipeline()
  dates.forEach((date) => pipe.hget(dailyKey(date), cKey))
  const results = await pipe.exec() as (number | null)[]

  const scoreByDate: Record<string, number | null> = {}
  dates.forEach((date, i) => {
    scoreByDate[date] = typeof results[i] === 'number' ? (results[i] as number) : null
  })

  // Fall back to Postgres for any days not in Redis — covers removed characters
  // whose Redis snapshots have expired but whose Postgres history is permanent.
  const missingDates = dates.filter(d => scoreByDate[d] === null)
  if (missingDates.length > 0) {
    try {
      const sql = getDb()
      const rows = await sql`
        SELECT snapped_on::text AS date, score
        FROM score_history
        WHERE char_key = ${cKey}
          AND snapped_on = ANY(${missingDates}::date[])
      ` as { date: string; score: number }[]
      for (const row of rows) {
        scoreByDate[row.date] = row.score
      }
    } catch {
      // Non-fatal — Redis data is still served
    }
  }

  const history = dates.map(date => ({ date, score: scoreByDate[date] }))

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
  return res.json(history)
}
