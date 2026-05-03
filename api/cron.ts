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

interface CharacterInput {
  name: string
  realm: string
  region: string
}

function charKey(c: CharacterInput) {
  return `${c.name}-${c.realm}-${c.region}`.toLowerCase()
}

function easternDate(d: Date): string {
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function dailyKey(dateStr: string) {
  return `tank-me-later:daily:${dateStr}`
}

function rankKey(dateStr: string) {
  return `tank-me-later:daily-rank:${dateStr}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }

  const characters = await redis.get<CharacterInput[]>('tank-me-later:characters') ?? []
  if (characters.length === 0) return res.json({ snapshotted: 0 })

  const results = await Promise.allSettled(
    characters.map(async (char) => {
      const params = new URLSearchParams({
        region: char.region,
        realm: char.realm,
        name: char.name,
        fields: 'mythic_plus_scores_by_season:current',
      })
      const upstream = await fetch(`https://raider.io/api/v1/characters/profile?${params}`)
      if (!upstream.ok) throw new Error(`${char.name}: ${upstream.status}`)
      const data = await upstream.json()
      const score: number = data?.mythic_plus_scores_by_season?.[0]?.scores?.tank ?? 0
      return { key: charKey(char), score }
    })
  )

  const scoreSnapshot: Record<string, number> = {}
  for (const result of results) {
    if (result.status === 'fulfilled') {
      scoreSnapshot[result.value.key] = result.value.score
    }
  }

  const ttl = 60 * 60 * 24 * 7
  const todayEastern = easternDate(new Date())

  if (Object.keys(scoreSnapshot).length > 0) {
    await redis.hset(dailyKey(todayEastern), scoreSnapshot)
    await redis.expire(dailyKey(todayEastern), ttl)

    const rankSnapshot: Record<string, number> = {}
    Object.entries(scoreSnapshot)
      .filter(([, s]) => s > 0)
      .sort(([, a], [, b]) => b - a)
      .forEach(([key], i) => { rankSnapshot[key] = i + 1 })

    if (Object.keys(rankSnapshot).length > 0) {
      await redis.hset(rankKey(todayEastern), rankSnapshot)
      await redis.expire(rankKey(todayEastern), ttl)
    }
  }

  const sql = getDb()
  const dateStr = todayEastern
  await Promise.allSettled(
    characters
      .filter((c) => scoreSnapshot[charKey(c)] != null)
      .map((c) => {
        const key = charKey(c)
        const score = scoreSnapshot[key]
        return sql`
          INSERT INTO score_history (char_key, name, realm, region, score, snapped_on)
          VALUES (${key}, ${c.name}, ${c.realm}, ${c.region}, ${score}, ${dateStr})
          ON CONFLICT (char_key, snapped_on) DO UPDATE SET score = EXCLUDED.score
        `
      })
  )

  return res.json({ snapshotted: Object.keys(scoreSnapshot).length })
}
