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

  const snapshot: Record<string, number> = {}
  for (const result of results) {
    if (result.status === 'fulfilled') {
      snapshot[result.value.key] = result.value.score
    }
  }

  if (Object.keys(snapshot).length > 0) {
    const key = dailyKey(new Date())
    await redis.hset(key, snapshot)
    await redis.expire(key, 60 * 60 * 24 * 7) // keep 7 days
  }

  return res.json({ snapshotted: Object.keys(snapshot).length })
}
