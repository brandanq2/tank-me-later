import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const CACHE_KEY = 'tank-me-later:title-watch:cache'
const PERMA_KEY = 'tank-me-later:title-watch:perma'

const DEFAULT_SEASON = 'season-mn-1'
const DEFAULT_REGION = 'us'

// A player is "safe" once their IO is this far above the title cutoff.
const SAFE_MARGIN = 15
// How many ranked players to show on each side of the cutoff *score*.
const WINDOW_ABOVE = 5
const WINDOW_BELOW = 5
const PER_PAGE = 100
// Extra ranking pages to walk outward if one side of the cutoff comes up short.
const ROSTER_MAX_EXTRA_PAGES = 3
// Recompute the cached roster if it's older than this (cron keeps it warm).
const CACHE_TTL_MS = 30 * 60 * 1000

interface CharacterInput {
  name: string
  realm: string
  region: string
}

interface WatchStream {
  login: string
  url: string
  title: string
  viewerCount: number
  thumbnail: string
}

interface WatchPlayer {
  name: string
  realm: string
  realmName?: string
  region: string
  className?: string
  specName?: string
  race?: string
  score: number
  rank?: number
  profileUrl?: string
  thumbnailUrl?: string
  stream: WatchStream | null
  source: 'window' | 'perma'
  perma: boolean
  margin: number
  safe: boolean
}

interface TitleWatchData {
  updatedAt: number
  season: string
  region: string
  cutoff: { score: number; percentile: string; rank: number }
  players: WatchPlayer[]
}

function charKey(c: { name: string; realm: string; region: string }) {
  return `${c.name}-${c.realm}-${c.region}`.toLowerCase()
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

function mapStream(s: RankedCharacter['character']['stream']): WatchStream | null {
  if (!s || s.type !== 'live' || !s.name) return null
  return {
    login: s.name,
    url: `https://www.twitch.tv/${s.name}`,
    title: s.title ?? '',
    viewerCount: s.viewer_count ?? 0,
    thumbnail: (s.thumbnail_url ?? '').replace('{width}', '440').replace('{height}', '248'),
  }
}

function rankedToPlayer(rc: RankedCharacter, source: 'window' | 'perma', cutoffScore: number, perma: boolean): WatchPlayer {
  const c = rc.character
  return {
    name: c.name,
    realm: c.realm?.slug ?? '',
    realmName: c.realm?.name,
    region: c.region?.slug ?? DEFAULT_REGION,
    className: c.class?.name,
    specName: c.spec?.name,
    race: c.race?.name,
    score: rc.score,
    rank: rc.rank,
    profileUrl: c.path ? `https://raider.io${c.path}` : undefined,
    stream: mapStream(c.stream),
    source,
    perma: perma || source === 'perma',
    margin: round1(rc.score - cutoffScore),
    safe: rc.score - cutoffScore >= SAFE_MARGIN,
  }
}

async function fetchRankPage(season: string, region: string, page: number): Promise<RankedCharacter[]> {
  const url = `https://raider.io/api/mythic-plus/rankings/characters?region=${region}&season=${season}&class=all&role=all&page=${page}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json() as { rankings?: { rankedCharacters?: RankedCharacter[] } }
  return data?.rankings?.rankedCharacters ?? []
}

/**
 * Ranked characters around the cutoff, guaranteed to straddle it by score.
 *
 * Rank and score drift apart at the boundary: the cutoff is floored and dozens of
 * players tie on the same IO, so the last character at or above the effective
 * cutoff can sit well past `cutoffRank` — centring on rank alone returns a window
 * that is entirely above the line. Page outward until both sides are covered.
 */
async function collectStraddle(
  season: string,
  region: string,
  cutoffRank: number,
  cutoff: number,
): Promise<RankedCharacter[]> {
  const center = Math.floor((cutoffRank - 1) / PER_PAGE)
  const byRank = new Map<number, RankedCharacter>()
  const soak = (rc: RankedCharacter[]) => { for (const x of rc) byRank.set(x.rank, x) }
  const countAbove = () => [...byRank.values()].filter((x) => x.score >= cutoff).length
  const countBelow = () => [...byRank.values()].filter((x) => x.score < cutoff).length

  // The cutoff page plus its neighbours covers both sides in practice, and gives
  // the perma merge below a wide enough net to read ranks from.
  const base = [...new Set([center - 1, center, center + 1])].filter((p) => p >= 0)
  for (const rc of await Promise.all(base.map((p) => fetchRankPage(season, region, p)))) soak(rc)

  for (let p = Math.min(...base) - 1, n = 0; countAbove() < WINDOW_ABOVE && p >= 0 && n < ROSTER_MAX_EXTRA_PAGES; p--, n++) {
    const rc = await fetchRankPage(season, region, p)
    if (rc.length === 0) break
    soak(rc)
  }
  for (let p = Math.max(...base) + 1, n = 0; countBelow() < WINDOW_BELOW && n < ROSTER_MAX_EXTRA_PAGES; p++, n++) {
    const rc = await fetchRankPage(season, region, p)
    if (rc.length === 0) break
    soak(rc)
  }

  // Rank ascending is score descending, which the window slicing relies on.
  return [...byRank.values()].sort((a, b) => a.rank - b.rank)
}

async function fetchPermaPlayer(pc: CharacterInput, cutoffScore: number): Promise<WatchPlayer | null> {
  const params = new URLSearchParams({
    region: pc.region,
    realm: pc.realm,
    name: pc.name,
    fields: 'mythic_plus_scores_by_season:current',
  })
  const res = await fetch(`https://raider.io/api/v1/characters/profile?${params}`)
  if (!res.ok) return null
  const data = await res.json() as {
    name?: string
    class?: string
    active_spec_name?: string
    race?: string
    realm?: string
    thumbnail_url?: string
    profile_url?: string
    mythic_plus_scores_by_season?: Array<{ scores?: { all?: number } }>
  }
  const score = data.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0
  return {
    name: data.name ?? pc.name,
    realm: pc.realm,
    realmName: data.realm,
    region: pc.region,
    className: data.class,
    specName: data.active_spec_name,
    race: data.race,
    score,
    profileUrl: data.profile_url,
    thumbnailUrl: data.thumbnail_url,
    stream: null,
    source: 'perma',
    perma: true,
    margin: round1(score - cutoffScore),
    safe: score - cutoffScore >= SAFE_MARGIN,
  }
}

async function computeRoster(season: string, region: string): Promise<TitleWatchData> {
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
  // Blizzard truncates the cutoff to an integer when awarding the title, so
  // margins/safe are measured against the floored value.
  const effectiveCutoff = Math.floor(cutoffScore)

  const ranked = await collectStraddle(season, region, cutoffRank, effectiveCutoff)

  // The window is the players nearest the cutoff on each side of it — the lowest
  // scores still holding title and the highest scores that have lost it.
  const nearCutoff = [
    ...ranked.filter((rc) => rc.score >= effectiveCutoff).slice(-WINDOW_ABOVE),
    ...ranked.filter((rc) => rc.score < effectiveCutoff).slice(0, WINDOW_BELOW),
  ]
  const players: WatchPlayer[] = nearCutoff.map((rc) => rankedToPlayer(rc, 'window', effectiveCutoff, false))

  // Merge the permanent watch list.
  const perma = (await redis.get<CharacterInput[]>(PERMA_KEY)) ?? []
  const shown = new Map(players.map((p) => [charKey(p), p]))
  const rankedByKey = new Map(
    ranked.map((rc) => [charKey({
      name: rc.character.name,
      realm: rc.character.realm?.slug ?? '',
      region: rc.character.region?.slug ?? region,
    }), rc]),
  )

  const toFetch: CharacterInput[] = []
  for (const pc of perma) {
    const k = charKey(pc)
    const existing = shown.get(k)
    if (existing) {
      existing.perma = true
      continue
    }
    const rc = rankedByKey.get(k)
    if (rc) {
      players.push(rankedToPlayer(rc, 'perma', effectiveCutoff, true))
      continue
    }
    toFetch.push(pc)
  }

  const fetched = await Promise.all(toFetch.map((pc) => fetchPermaPlayer(pc, effectiveCutoff)))
  for (const p of fetched) if (p) players.push(p)

  return {
    updatedAt: Date.now(),
    season,
    region,
    cutoff: { score: cutoffScore, percentile: '0.1%', rank: cutoffRank },
    players,
  }
}

// ── Command Room: live streamers within WINDOW points of the cutoff ─────────
// Folded into this function (rather than its own file) to stay under the
// Hobby-plan limit of 12 Serverless Functions per deployment.
const ROOM_CACHE_KEY = 'tank-me-later:command-room:cache'
const ROOM_WINDOW = 30
const ROOM_MAX_PAGES_EACH = 20
const ROOM_CACHE_TTL_MS = 3 * 60 * 1000

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

// raider.io only attaches stream data to ranked characters, so we page the
// rankings outward from the cutoff and stop once we leave the score band.
async function collectBand(season: string, region: string, cutoffRank: number, low: number, high: number): Promise<RankedCharacter[]> {
  const center = Math.floor((cutoffRank - 1) / PER_PAGE)
  const out: RankedCharacter[] = []
  for (let p = center, steps = 0; p >= 0 && steps <= ROOM_MAX_PAGES_EACH; p--, steps++) {
    const rc = await fetchRankPage(season, region, p)
    if (rc.length === 0) break
    out.push(...rc)
    if (rc[rc.length - 1].score > high) break // whole page above the band
  }
  for (let p = center + 1, steps = 0; steps <= ROOM_MAX_PAGES_EACH; p++, steps++) {
    const rc = await fetchRankPage(season, region, p)
    if (rc.length === 0) break
    out.push(...rc)
    if (rc[0].score < low) break // whole page below the band
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
  const low = effectiveCutoff - ROOM_WINDOW
  const high = effectiveCutoff + ROOM_WINDOW

  const ranked = await collectBand(season, region, cutoffRank, low, high)
  const seen = new Set<number>()
  const players: CommandRoomPlayer[] = []
  for (const rc of ranked) {
    if (rc.score < low || rc.score > high) continue
    const stream = mapStream(rc.character.stream)
    if (!stream) continue
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
      stream,
    })
  }
  players.sort((a, b) => a.score - b.score)

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

  // Just the permanent watch list, so the Command Room can show per-stream
  // watch state without recomputing the whole roster.
  if (req.query.view === 'perma' && req.method === 'GET') {
    const perma = (await redis.get<CharacterInput[]>(PERMA_KEY)) ?? []
    return res.json({ perma })
  }

  // Command Room view (GET only).
  if (req.query.view === 'command-room') {
    const refresh = req.query.refresh === '1'
    const cached = await redis.get<CommandRoomData>(ROOM_CACHE_KEY)
    if (!refresh && cached && Date.now() - cached.updatedAt < ROOM_CACHE_TTL_MS) {
      return res.json(cached)
    }
    try {
      const data = await computeRoom(season, region)
      await redis.set(ROOM_CACHE_KEY, data)
      return res.json(data)
    } catch (err) {
      if (cached) return res.json(cached)
      return res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to compute command room' })
    }
  }

  if (req.method === 'POST') {
    const input = req.body as CharacterInput
    if (!input?.name?.trim() || !input?.realm?.trim()) {
      return res.status(400).json({ error: 'Name and realm are required' })
    }
    const clean: CharacterInput = {
      name: input.name.trim(),
      realm: input.realm.trim().toLowerCase(),
      region: (input.region || DEFAULT_REGION).trim().toLowerCase(),
    }
    const perma = (await redis.get<CharacterInput[]>(PERMA_KEY)) ?? []
    if (!perma.some((c) => charKey(c) === charKey(clean))) {
      await redis.set(PERMA_KEY, [...perma, clean])
    }
    await redis.del(CACHE_KEY)
    return res.status(201).json({ perma: [...perma.filter((c) => charKey(c) !== charKey(clean)), clean] })
  }

  if (req.method === 'DELETE') {
    const { name, realm, region: reg } = req.query as Record<string, string>
    const key = charKey({ name: name ?? '', realm: realm ?? '', region: reg ?? DEFAULT_REGION })
    const perma = (await redis.get<CharacterInput[]>(PERMA_KEY)) ?? []
    const updated = perma.filter((c) => charKey(c) !== key)
    await redis.set(PERMA_KEY, updated)
    await redis.del(CACHE_KEY)
    return res.json({ perma: updated })
  }

  // GET
  const refresh = req.query.refresh === '1'
  const cached = await redis.get<TitleWatchData>(CACHE_KEY)
  if (!refresh && cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return res.json(cached)
  }

  try {
    const data = await computeRoster(season, region)
    await redis.set(CACHE_KEY, data)
    return res.json(data)
  } catch (err) {
    if (cached) return res.json(cached) // serve stale on upstream failure
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to compute roster' })
  }
}
