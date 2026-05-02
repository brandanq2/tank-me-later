import type { CharacterInput, VoteRecord, HistoryPoint } from './types'

interface RaiderIOScore {
  season: string
  scores: {
    all: number
    dps: number
    healer: number
    tank: number
  }
}

interface RaiderIOResponse {
  name: string
  race: string
  class: string
  gender: number
  active_spec_name: string
  active_spec_role: string
  thumbnail_url: string
  profile_url: string
  mythic_plus_scores_by_season: RaiderIOScore[]
}

export interface CharacterData {
  score: number
  race: string
  gender: string
  className: string
  specName: string
  thumbnailUrl: string
  profileUrl: string
}

export interface CutoffData {
  score: number
  percentile: string
}

export interface ScoreReport {
  delta: number
  prevRank: number | null
}

export async function reportScore(
  char: CharacterInput,
  score: number,
): Promise<ScoreReport> {
  const res = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...char, score }),
  })
  if (!res.ok) return { delta: 0, prevRank: null }
  const data = await res.json()
  return { delta: data.delta ?? 0, prevRank: data.prevRank ?? null }
}

export async function listCharacters(): Promise<CharacterInput[]> {
  const res = await fetch('/api/characters')
  if (!res.ok) return []
  return res.json()
}

export async function persistCharacter(char: CharacterInput): Promise<void> {
  await fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(char),
  })
}

export async function removePersistedCharacter(char: CharacterInput): Promise<void> {
  const params = new URLSearchParams({ name: char.name, realm: char.realm, region: char.region })
  await fetch(`/api/characters?${params}`, { method: 'DELETE' })
}

export async function fetchCutoff(season = 'season-mn-1', region = 'us'): Promise<CutoffData> {
  const params = new URLSearchParams({ season, region })
  const res = await fetch(`/api/cutoff?${params}`)

  if (!res.ok) throw new Error(`Cutoff API error ${res.status}`)

  const data = await res.json()
  console.log('[raiderio] cutoff response:', JSON.stringify(data, null, 2))

  const p999 =
    data?.cutoffs?.p999 ??
    data?.all?.p999 ??
    data?.p999

  if (p999?.score != null) {
    return { score: p999.score, percentile: '0.1%' }
  }

  throw new Error('Cutoff score not found in response')
}

export function getSessionId(): string {
  const KEY = 'tank-me-later:session'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}

export async function fetchVotes(): Promise<VoteRecord[]> {
  const res = await fetch('/api/votes')
  if (!res.ok) return []
  return res.json()
}

export async function initiateVote(
  entry: { name: string; realm: string; region: string; className?: string; specName?: string; thumbnailUrl?: string },
  sessionId: string,
): Promise<VoteRecord | null> {
  const charKey = `${entry.name}-${entry.realm}-${entry.region}`.toLowerCase()
  const res = await fetch('/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ charKey, ...entry, sessionId }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function castVote(charKey: string, vote: 'yes' | 'no', sessionId: string): Promise<VoteRecord | null> {
  const res = await fetch('/api/vote-cast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ charKey, vote, sessionId }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function generateCover(
  charKey: string,
  race: string,
  gender: string,
  specName: string,
  className: string,
  charName: string,
  thumbnailUrl?: string,
  bust = false,
): Promise<{ imageUrl: string }> {
  const url = bust ? '/api/generate-cover?bust=1' : '/api/generate-cover'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ charKey, race, gender, specName, className, charName, thumbnailUrl }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = 'Generation failed'
    try { message = (JSON.parse(text) as { error?: string }).error ?? text } catch { message = text || 'Generation failed' }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchHistory(char: CharacterInput): Promise<HistoryPoint[]> {
  const params = new URLSearchParams({ name: char.name, realm: char.realm, region: char.region })
  const res = await fetch(`/api/history?${params}`)
  if (!res.ok) return []
  return res.json()
}

export function insetAvatarUrl(url: string): string {
  return url.replace(/-avatar\.jpg/, '-inset.jpg')
}

export async function fetchCharacter(char: CharacterInput): Promise<CharacterData> {
  const params = new URLSearchParams({
    region: char.region,
    realm: char.realm,
    name: char.name,
    fields: 'mythic_plus_scores_by_season:current',
  })

  const res = await fetch(`/api/raiderio?${params}`)

  if (!res.ok) {
    if (res.status === 400 || res.status === 404) {
      throw new Error('Character not found')
    }
    throw new Error(`API error ${res.status}`)
  }

  const data: RaiderIOResponse = await res.json()
  const currentSeason = data.mythic_plus_scores_by_season?.[0]
  const score = currentSeason?.scores?.tank ?? 0

  const isFemale = data.gender === 1 || String(data.gender).toLowerCase() === 'female'
  return {
    score,
    race: data.race,
    gender: isFemale ? 'female' : 'male',
    className: data.class,
    specName: data.active_spec_name,
    thumbnailUrl: data.thumbnail_url,
    profileUrl: data.profile_url,
  }
}
