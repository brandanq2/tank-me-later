import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const CACHE_KEY = 'tank-me-later:command-room:cache'
const DEFAULT_SEASON = 'season-mn-1'
const DEFAULT_REGION = 'us'

// Show live streamers whose IO is within this many points of the title cutoff.
const WINDOW = 30
const PER_PAGE = 100
const MAX_PAGES_EACH = 20
// Streams change often, so keep the cache short-lived.
const CACHE_TTL_MS = 3 * 60 * 1000

interface WatchStream {
  login: string
  url: string
  title: string
  viewerCount: number
  thumbnail: string
}

interface CommandRoomPlayer {
  name: string
  realm: string
  realmName?: string
  region: string
  className?: string
  specName?: string
  race?: string
  score: number
  rank: number
  margin: number
  profileUrl?: string
  stream: WatchStream
}

interface CommandRoomData {
  updatedAt: number
  season: string
  region: string
  cutoff: { score: number; percentile: string; rank: number }
  players: CommandRoomPlayer[]
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

interface RankedCharacter {
  rank: number
  score: number
  character: {
    name: string
    class?: { name: string }
    spec?: { name: string }
    race?: { name: string }
    path?: string
    realm?: { name: string; slug: string }
    region?: { slug: string }
    stream?: {
      type?: string
      name?: string
      title?: string
      viewer_count?: number
      thumbnail_url?: string
    } | null
  }
}

async function fetchRankPage(season: string, region: string, page: number): Promise<RankedCharacter[]> {
  const url = `https://raider.io/api/mythic-plus/rankings/characters?region=${region}&season=${season}&class=all&role=all&page=${page}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json() as { rankings?: { rankedCharacters?: RankedCharacter[] } }
  return data?.rankings?.rankedCharacters ?? []
}

// Scan outward from the cutoff page until we leave the score band in each
// direction (raider.io only attaches stream data to ranked characters, so we
// page the rankings around the cutoff and keep the live ones in the window).
async function collectBand(season: string, region: string, cutoffRank: number, low: number, high: number): Promise<RankedCharacter[]> {
  const center = Math.floor((cutoffRank - 1) / PER_PAGE)
  const out: RankedCharacter[] = []

  for (let p = center, steps = 0; p >= 0 && steps <= MAX_PAGES_EACH; p--, steps++) {
    const rc = await fetchRankPage(season, region, p)
    if (rc.length === 0) break
    out.push(...rc)
    if (rc[rc.length - 1].score > high) break // whole page is above the band
  }
  for (let p = center + 1, steps = 0; steps <= MAX_PAGES_EACH; p++, steps++) {
    const rc = await fetchRankPage(season, region, p)
    if (rc.length === 0) break
    out.push(...rc)
    if (rc[0].score < low) break // whole page is below the band
  }
  return out
}

async function computeRoom(season: string, region: string): Promise<CommandRoomData> {
  const cutoffRes = await fetch(`https://raider.io/api/v1/mythic-plus/season-cutoffs?season=${season}&region=${region}`)
  if (!cutoffRes.ok) throw new Error(`cutoff ${cutoffRes.status}`)
  const cutoffJson = await cutoffRes.json() as {
    cutoffs?: { p999?: { all?: { quantileMinValue?: number; quantilePopulationCount?: number } } }
  }
  const p999 = cutoffJson?.cutoffs?.p999?.all
  const cutoffScore = p999?.quantileMinValue
  const cutoffRank = p999?.quantilePopulationCount
  if (typeof cutoffScore !== 'number' || typeof cutoffRank !== 'number') {
    throw new Error('cutoff not found')
  }
  const effectiveCutoff = Math.floor(cutoffScore)
  const low = effectiveCutoff - WINDOW
  const high = effectiveCutoff + WINDOW

  const ranked = await collectBand(season, region, cutoffRank, low, high)

  const seen = new Set<number>()
  const players: CommandRoomPlayer[] = []
  for (const rc of ranked) {
    if (rc.score < low || rc.score > high) continue
    const s = rc.character.stream
    if (!s || s.type !== 'live' || !s.name) continue
    if (seen.has(rc.rank)) continue
    seen.add(rc.rank)
    const c = rc.character
    players.push({
      name: c.name,
      realm: c.realm?.slug ?? '',
      realmName: c.realm?.name,
      region: c.region?.slug ?? region,
      className: c.class?.name,
      specName: c.spec?.name,
      race: c.race?.name,
      score: rc.score,
      rank: rc.rank,
      margin: round1(rc.score - effectiveCutoff),
      profileUrl: c.path ? `https://raider.io${c.path}` : undefined,
      stream: {
        login: s.name,
        url: `https://www.twitch.tv/${s.name}`,
        title: s.title ?? '',
        viewerCount: s.viewer_count ?? 0,
        thumbnail: (s.thumbnail_url ?? '').replace('{width}', '640').replace('{height}', '360'),
      },
    })
  }
  players.sort((a, b) => b.stream.viewerCount - a.stream.viewerCount)

  return {
    updatedAt: Date.now(),
    season,
    region,
    cutoff: { score: cutoffScore, percentile: '0.1%', rank: cutoffRank },
    players,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const season = (req.query.season as string) || DEFAULT_SEASON
  const region = (req.query.region as string) || DEFAULT_REGION
  const refresh = req.query.refresh === '1'

  const cached = await redis.get<CommandRoomData>(CACHE_KEY)
  if (!refresh && cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return res.json(cached)
  }

  try {
    const data = await computeRoom(season, region)
    await redis.set(CACHE_KEY, data)
    return res.json(data)
  } catch (err) {
    if (cached) return res.json(cached)
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to compute command room' })
  }
}
