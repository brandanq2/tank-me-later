import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

interface CharacterInput {
  name: string
  realm: string
  region: string
}

function charKey(c: CharacterInput) {
  return `${c.name}-${c.realm}-${c.region}`.toLowerCase()
}

function dailyKey(date: Date) {
  return `tank-me-later:daily:${date.toISOString().slice(0, 10)}`
}

function rankKey(date: Date) {
  return `tank-me-later:daily-rank:${date.toISOString().slice(0, 10)}`
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
  const snapshotDate = new Date()
  snapshotDate.setUTCDate(snapshotDate.getUTCDate() - 1)

  if (Object.keys(scoreSnapshot).length > 0) {
    await redis.hset(dailyKey(snapshotDate), scoreSnapshot)
    await redis.expire(dailyKey(snapshotDate), ttl)

    const rankSnapshot: Record<string, number> = {}
    Object.entries(scoreSnapshot)
      .filter(([, s]) => s > 0)
      .sort(([, a], [, b]) => b - a)
      .forEach(([key], i) => { rankSnapshot[key] = i + 1 })

    if (Object.keys(rankSnapshot).length > 0) {
      await redis.hset(rankKey(snapshotDate), rankSnapshot)
      await redis.expire(rankKey(snapshotDate), ttl)
    }
  }

  return res.json({ snapshotted: Object.keys(scoreSnapshot).length })
}
