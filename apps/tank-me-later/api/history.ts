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

const LIST_PREFIXES: Record<string, string> = {
  tanks: 'tank-me-later',
  open:  'tank-me-later:open',
}

const WARBAND_DAILY_PREFIX = 'tank-me-later:warband-daily'

function dailyKey(prefix: string, dateStr: string) {
  return `${prefix}:daily:${dateStr}`
}

function charKey(name: string, realm: string, region: string) {
  return `${name}-${realm}-${region}`.toLowerCase()
}

function easternDate(d: Date): string {
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Dates are in Eastern time to match cron snapshot keys.
function pastDates(days: number): string[] {
  const dates: string[] = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    dates.push(easternDate(new Date(now - i * 24 * 60 * 60 * 1000)))
  }
  return dates
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { kind, id, name, realm, region, list } = req.query as {
    kind?: string
    id?: string
    name?: string
    realm?: string
    region?: string
    list?: string
  }

  const dates = pastDates(7)

  if (kind === 'warband') {
    if (!id) return res.status(400).end()
    const pipe = redis.pipeline()
    dates.forEach((date) => pipe.hget(`${WARBAND_DAILY_PREFIX}:${date}`, id))
    const results = await pipe.exec() as (number | null)[]
    const history = dates.map((date, i) => ({
      date,
      score: typeof results[i] === 'number' ? results[i] : null,
    }))
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    return res.json(history)
  }

  if (!name || !realm || !region) return res.status(400).end()

  const listKey = list && LIST_PREFIXES[list] ? list : 'tanks'
  const prefix = LIST_PREFIXES[listKey]
  const cKey = charKey(name, realm, region)

  const pipe = redis.pipeline()
  dates.forEach((date) => pipe.hget(dailyKey(prefix, date), cKey))
  const results = await pipe.exec() as (number | null)[]

  const scoreByDate: Record<string, number | null> = {}
  dates.forEach((date, i) => {
    scoreByDate[date] = typeof results[i] === 'number' ? (results[i] as number) : null
  })

  // Postgres fallback only applies to the tank list (it's the only list whose
  // cron run writes score_history rows; mixing in tank-IO history for an
  // open-list view would conflate two different score fields).
  const missingDates = dates.filter(d => scoreByDate[d] === null)
  if (listKey === 'tanks' && missingDates.length > 0) {
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
