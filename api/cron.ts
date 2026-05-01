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

function dailyKeysKey(date: Date) {
  return `tank-me-later:daily-keys:${date.toISOString().slice(0, 10)}`
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
        fields: 'mythic_plus_scores_by_season:current,mythic_plus_best_runs:tank_score',
      })
      const upstream = await fetch(`https://raider.io/api/v1/characters/profile?${params}`)
      if (!upstream.ok) throw new Error(`${char.name}: ${upstream.status}`)
      const data = await upstream.json()

      const score: number = data?.mythic_plus_scores_by_season?.[0]?.scores?.tank ?? 0
      const keys: Record<string, number> = {}
      for (const run of data?.mythic_plus_best_runs ?? []) {
        keys[run.short_name] = run.mythic_level
      }

      return { key: charKey(char), score, keys }
    })
  )

  const scoreSnapshot: Record<string, number> = {}
  const keysSnapshot: Record<string, string> = {}

  for (const result of results) {
    if (result.status === 'fulfilled') {
      scoreSnapshot[result.value.key] = result.value.score
      keysSnapshot[result.value.key] = JSON.stringify(result.value.keys)
    }
  }

  const ttl = 60 * 60 * 24 * 7
  const today = new Date()

  await Promise.all([
    Object.keys(scoreSnapshot).length > 0
      ? redis.hset(dailyKey(today), scoreSnapshot).then(() => redis.expire(dailyKey(today), ttl))
      : null,
    Object.keys(keysSnapshot).length > 0
      ? redis.hset(dailyKeysKey(today), keysSnapshot).then(() => redis.expire(dailyKeysKey(today), ttl))
      : null,
  ])

  return res.json({ snapshotted: Object.keys(scoreSnapshot).length })
}
