import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

type Division = 'I' | 'II' | 'III' | 'IV' | null

interface ScoreAnchor { topPercent: number; score: number }

interface RankBucket { tier: string; division: Division; topPercent: number }

export interface RankCutoff {
  tier: string
  division: Division
  label: string
  minScore: number
  topPercent: number
}

const QUEUE = 'RANKED_SOLO_5x5'
const RIOT_HOST = 'https://na1.api.riotgames.com'
const ENTRIES_PER_PAGE = 205

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function riotGet(path: string, apiKey: string): Promise<unknown> {
  await sleep(1200) // ~50 req/min, safely under the 100 req/2min dev key limit
  const res = await fetch(`${RIOT_HOST}${path}`, {
    headers: { 'X-Riot-Token': apiKey },
  })
  if (!res.ok) throw new Error(`Riot API ${res.status}: ${path}`)
  return res.json()
}

// Binary search for the last non-empty page, capped at 8 iterations (~±4 pages of error).
async function findLastPage(tier: string, division: string, apiKey: string): Promise<number> {
  let lo = 1, hi = 1000
  for (let i = 0; i < 7 && lo < hi; i++) {
    const mid = Math.ceil((lo + hi) / 2)
    const data = await riotGet(
      `/lol/league/v4/entries/${QUEUE}/${tier}/${division}?page=${mid}`,
      apiKey,
    ) as unknown[]
    if (Array.isArray(data) && data.length > 0) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Fetches live NA rank distribution from the Riot API and returns topPercent boundaries
// ordered from highest rank (Challenger) to lowest (Iron IV).
async function fetchRiotDistribution(apiKey: string): Promise<RankBucket[]> {
  const segments: Array<{ tier: string; division: Division; count: number }> = []

  // Master+ endpoints return the full entry list in one call
  const masterPlus: Array<[string, string]> = [
    [`/lol/league/v4/challengerleagues/by-queue/${QUEUE}`, 'Challenger'],
    [`/lol/league/v4/grandmasterleagues/by-queue/${QUEUE}`, 'Grandmaster'],
    [`/lol/league/v4/masterleagues/by-queue/${QUEUE}`, 'Master'],
  ]
  for (const [path, tier] of masterPlus) {
    const data = await riotGet(path, apiKey) as { entries?: unknown[] }
    segments.push({ tier, division: null, count: data?.entries?.length ?? 0 })
  }

  // Diamond → Iron, division I → IV (highest to lowest within each tier)
  const TIERS = ['DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON']
  const DIVISIONS = ['I', 'II', 'III', 'IV']
  for (const tier of TIERS) {
    for (const div of DIVISIONS) {
      const lp = await findLastPage(tier, div, apiKey)
      const label = tier.charAt(0) + tier.slice(1).toLowerCase()
      segments.push({ tier: label, division: div as Division, count: lp * ENTRIES_PER_PAGE })
    }
  }

  const total = segments.reduce((sum, s) => sum + s.count, 0)
  if (total === 0) throw new Error('Riot distribution returned zero players')

  let cumulative = 0
  return segments.map(({ tier, division, count }) => {
    cumulative += count
    return { tier, division, topPercent: parseFloat((cumulative / total * 100).toFixed(2)) }
  })
}

function topPercentToScore(topPercent: number, anchors: ScoreAnchor[]): number {
  const pts = [...anchors].sort((a, b) => a.topPercent - b.topPercent)
  const top = pts[0]
  const bottom = pts[pts.length - 1]

  if (topPercent <= top.topPercent) {
    const next = pts[1]
    const slope = (next.score - top.score) / (next.topPercent - top.topPercent)
    return top.score + (topPercent - top.topPercent) * slope
  }

  if (topPercent >= bottom.topPercent) {
    const prev = pts[pts.length - 2]
    const slope = (bottom.score - prev.score) / (bottom.topPercent - prev.topPercent)
    return Math.max(0, bottom.score + (topPercent - bottom.topPercent) * slope)
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const lo = pts[i], hi = pts[i + 1]
    if (topPercent >= lo.topPercent && topPercent <= hi.topPercent) {
      const t = (topPercent - lo.topPercent) / (hi.topPercent - lo.topPercent)
      return lo.score + t * (hi.score - lo.score)
    }
  }
  return 0
}

function extractAnchors(data: unknown): ScoreAnchor[] {
  const d = data as Record<string, unknown>
  const cutoffs = (d?.cutoffs ?? d) as Record<string, unknown>
  const keys: Array<[string, number]> = [
    ['p999', 0.1], ['p990', 1.0], ['p900', 10.0], ['p750', 25.0], ['p600', 40.0],
  ]
  const anchors: ScoreAnchor[] = []
  for (const [key, topPercent] of keys) {
    const entry = cutoffs?.[key] as Record<string, unknown> | undefined
    const score = (entry?.all as Record<string, unknown> | undefined)?.quantileMinValue
    if (typeof score === 'number') anchors.push({ topPercent, score })
  }
  return anchors
}

function computeRankCutoffs(thresholds: RankBucket[], anchors: ScoreAnchor[]): RankCutoff[] {
  return thresholds.map(r => ({
    tier: r.tier,
    division: r.division,
    label: r.division ? `${r.tier} ${r.division}` : r.tier,
    minScore: Math.max(0, Math.round(topPercentToScore(r.topPercent, anchors))),
    topPercent: r.topPercent,
  }))
}

export const REDIS_KEY = 'tank-me-later:solo-queue-mapping'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }

  const riotApiKey = process.env.RIOT_API_KEY
  if (!riotApiKey) return res.status(500).json({ error: 'RIOT_API_KEY not set' })

  const CANDIDATES = ['season-mn-1', 'season-tww-3', 'season-tww-2']
  let anchors: ScoreAnchor[] = []
  let activeSeason = ''

  for (const slug of CANDIDATES) {
    const r = await fetch(
      `https://raider.io/api/v1/mythic-plus/season-cutoffs?season=${slug}&region=us`
    )
    if (!r.ok) continue
    const a = extractAnchors(await r.json())
    if (a.length >= 3) { anchors = a; activeSeason = slug; break }
  }

  if (!activeSeason) {
    return res.status(502).json({ error: 'No live season found on Raider.io' })
  }

  const thresholds = await fetchRiotDistribution(riotApiKey)

  const mapping = {
    updatedAt: new Date().toISOString(),
    season: activeSeason,
    region: 'us',
    riotRegion: 'na1',
    ranks: computeRankCutoffs(thresholds, anchors),
  }

  await redis.set(REDIS_KEY, mapping)

  return res.json({ ok: true, updatedAt: mapping.updatedAt, ranks: mapping.ranks.length })
}
