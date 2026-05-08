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

function dailyKey(prefix: string, dateStr: string) {
  return `${prefix}:daily:${dateStr}`
}

function rankKey(prefix: string, dateStr: string) {
  return `${prefix}:daily-rank:${dateStr}`
}

const LISTS = [
  { charsKey: 'tank-me-later:characters',      scoreField: 'tank' as const, prefix: 'tank-me-later',      saveHistory: true  },
  { charsKey: 'tank-me-later:characters:open', scoreField: 'all'  as const, prefix: 'tank-me-later:open', saveHistory: false },
]

const WARBANDS_KEY = 'tank-me-later:warbands'
const WARBAND_DAILY_PREFIX = 'tank-me-later:warband-daily'

interface WarbandDefinition {
  id: string
  members: CharacterInput[]
}

async function snapshotList(
  characters: CharacterInput[],
  scoreField: 'tank' | 'all',
  prefix: string,
  todayEastern: string,
  ttl: number,
): Promise<Record<string, number>> {
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
      const score: number = data?.mythic_plus_scores_by_season?.[0]?.scores?.[scoreField] ?? 0
      return { key: charKey(char), score }
    })
  )

  const scoreSnapshot: Record<string, number> = {}
  for (const result of results) {
    if (result.status === 'fulfilled') {
      scoreSnapshot[result.value.key] = result.value.score
    }
  }

  if (Object.keys(scoreSnapshot).length > 0) {
    const dKey = dailyKey(prefix, todayEastern)
    const rKey = rankKey(prefix, todayEastern)

    await redis.hset(dKey, scoreSnapshot)
    await redis.expire(dKey, ttl)

    const rankSnapshot: Record<string, number> = {}
    Object.entries(scoreSnapshot)
      .filter(([, s]) => s > 0)
      .sort(([, a], [, b]) => b - a)
      .forEach(([key], i) => { rankSnapshot[key] = i + 1 })

    if (Object.keys(rankSnapshot).length > 0) {
      await redis.hset(rKey, rankSnapshot)
      await redis.expire(rKey, ttl)
    }
  }

  return scoreSnapshot
}

// Mirror of `computeWarbandEntry` in src/hooks/useWarbands.ts: best run per
// dungeon across all members, then top-8 sum.
async function snapshotWarbands(todayEastern: string, ttl: number): Promise<number> {
  const warbands = await redis.get<WarbandDefinition[]>(WARBANDS_KEY) ?? []
  if (warbands.length === 0) return 0

  const memberKeys = new Map<string, CharacterInput>()
  for (const wb of warbands) {
    for (const m of wb.members) memberKeys.set(charKey(m), m)
  }

  const runsByKey = new Map<string, Array<{ shortName: string; score: number }>>()
  await Promise.allSettled(
    [...memberKeys.entries()].map(async ([key, char]) => {
      const params = new URLSearchParams({
        region: char.region,
        realm: char.realm,
        name: char.name,
        fields: 'mythic_plus_best_runs:roster',
      })
      const upstream = await fetch(`https://raider.io/api/v1/characters/profile?${params}`)
      if (!upstream.ok) return
      const data = await upstream.json() as { mythic_plus_best_runs?: Array<{ short_name?: string; score?: number }> }
      const runs = (data?.mythic_plus_best_runs ?? [])
        .map(r => ({ shortName: r.short_name ?? '', score: r.score ?? 0 }))
        .filter(r => r.shortName)
      runsByKey.set(key, runs)
    })
  )

  const warbandScores: Record<string, number> = {}
  for (const wb of warbands) {
    const bestByDungeon = new Map<string, number>()
    for (const m of wb.members) {
      const runs = runsByKey.get(charKey(m)) ?? []
      for (const run of runs) {
        const existing = bestByDungeon.get(run.shortName) ?? 0
        if (run.score > existing) bestByDungeon.set(run.shortName, run.score)
      }
    }
    const score = [...bestByDungeon.values()].sort((a, b) => b - a).slice(0, 8).reduce((s, v) => s + v, 0)
    if (score > 0) warbandScores[wb.id] = score
  }

  if (Object.keys(warbandScores).length === 0) return 0

  const dKey = `${WARBAND_DAILY_PREFIX}:${todayEastern}`
  await redis.hset(dKey, warbandScores)
  await redis.expire(dKey, ttl)
  return Object.keys(warbandScores).length
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }

  const ttl = 60 * 60 * 24 * 7
  const todayEastern = easternDate(new Date())
  let totalSnapshotted = 0

  for (const list of LISTS) {
    const characters = await redis.get<CharacterInput[]>(list.charsKey) ?? []
    if (characters.length === 0) continue

    const scoreSnapshot = await snapshotList(characters, list.scoreField, list.prefix, todayEastern, ttl)
    totalSnapshotted += Object.keys(scoreSnapshot).length

    if (list.saveHistory) {
      const sql = getDb()
      await Promise.allSettled(
        characters
          .filter((c) => scoreSnapshot[charKey(c)] != null)
          .map((c) => {
            const key = charKey(c)
            const score = scoreSnapshot[key]
            return sql`
              INSERT INTO score_history (char_key, name, realm, region, score, snapped_on)
              VALUES (${key}, ${c.name}, ${c.realm}, ${c.region}, ${score}, ${todayEastern})
              ON CONFLICT (char_key, snapped_on) DO UPDATE SET score = EXCLUDED.score
            `
          })
      )
    }
  }

  const warbandsSnapshotted = await snapshotWarbands(todayEastern, ttl)

  return res.json({ snapshotted: totalSnapshotted, warbands: warbandsSnapshotted })
}
