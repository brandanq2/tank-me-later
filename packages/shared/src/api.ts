/**
 * Client calls both apps make. App-specific endpoints live in each app's own
 * src/api.ts, which re-exports this module so existing imports keep working.
 */
import type { CharacterInput } from './types'

export interface CutoffData {
  score: number
  percentile: string
}

export async function fetchCutoff(season = 'season-mn-1', region = 'us'): Promise<CutoffData> {
  const params = new URLSearchParams({ season, region })
  const res = await fetch(`/api/cutoff?${params}`)

  if (!res.ok) throw new Error(`Cutoff API error ${res.status}`)

  const data = await res.json()

  const score = data?.cutoffs?.p999?.all?.quantileMinValue
  if (score != null) {
    return { score, percentile: '0.1%' }
  }

  throw new Error('Cutoff score not found in response')
}

export interface KeyRun {
  keystoneRunId: number
  shortName: string
  dungeon: string
  level: number
  completedAt: string
  numUpgrades: number
  score: number
  url: string
}

export interface LivePlayerData {
  score: number
  bestRuns: KeyRun[]
  recentRuns: KeyRun[]
}

interface RawRun {
  keystone_run_id?: number
  short_name?: string
  dungeon?: string
  mythic_level?: number
  completed_at?: string
  num_keystone_upgrades?: number
  score?: number
  url?: string
}

function mapRun(r: RawRun): KeyRun {
  return {
    keystoneRunId: r.keystone_run_id ?? 0,
    shortName: r.short_name ?? '',
    dungeon: r.dungeon ?? '',
    level: r.mythic_level ?? 0,
    completedAt: r.completed_at ?? '',
    numUpgrades: r.num_keystone_upgrades ?? 0,
    score: r.score ?? 0,
    url: r.url ?? '',
  }
}

export async function fetchLivePlayer(char: CharacterInput): Promise<LivePlayerData | null> {
  const params = new URLSearchParams({
    region: char.region,
    realm: char.realm,
    name: char.name,
    fields: 'mythic_plus_scores_by_season:current,mythic_plus_best_runs,mythic_plus_recent_runs',
  })
  const res = await fetch(`/api/raiderio?${params}`)
  if (!res.ok) return null
  const data = await res.json() as {
    mythic_plus_scores_by_season?: Array<{ scores?: { all?: number } }>
    mythic_plus_best_runs?: RawRun[]
    mythic_plus_recent_runs?: RawRun[]
  }
  const score = data.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0
  return {
    score,
    bestRuns: (data.mythic_plus_best_runs ?? []).map(mapRun),
    recentRuns: (data.mythic_plus_recent_runs ?? []).map(mapRun),
  }
}

export async function fetchFlags(): Promise<Record<string, boolean>> {
  const res = await fetch('/api/flags')
  if (!res.ok) return {}
  return res.json()
}

export function insetAvatarUrl(url: string): string {
  return url.replace(/-avatar\.jpg/, '-inset.jpg')
}
