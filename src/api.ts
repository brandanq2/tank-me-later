import type { CharacterInput } from './types'

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
  active_spec_name: string
  active_spec_role: string
  thumbnail_url: string
  profile_url: string
  mythic_plus_scores_by_season: RaiderIOScore[]
}

export interface CharacterData {
  score: number
  className: string
  specName: string
  thumbnailUrl: string
  profileUrl: string
}

export interface CutoffData {
  score: number
  percentile: string
}

export async function reportScore(char: CharacterInput, score: number): Promise<number> {
  const res = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...char, score }),
  })
  if (!res.ok) return 0
  const data = await res.json()
  return data.delta ?? 0
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

  // Try common response shapes the API might return
  const p999 =
    data?.cutoffs?.p999 ??
    data?.all?.p999 ??
    data?.p999

  if (p999?.score != null) {
    return { score: p999.score, percentile: '0.1%' }
  }

  throw new Error('Cutoff score not found in response')
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

  return {
    score,
    className: data.class,
    specName: data.active_spec_name,
    thumbnailUrl: data.thumbnail_url,
    profileUrl: data.profile_url,
  }
}
