import type { CharacterInput } from '@tml/shared/types'

// Shared client calls live in the workspace package; re-exported here so pages
// can pull everything they need from './api'.
export * from '@tml/shared/api'

export interface WatchStream {
  login: string
  url: string
  title: string
  viewerCount: number
  thumbnail: string
}

export interface WatchPlayer {
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

export interface TitleWatchData {
  updatedAt: number
  season: string
  region: string
  cutoff: { score: number; percentile: string; rank: number }
  players: WatchPlayer[]
}

export async function fetchTitleWatch(refresh = false): Promise<TitleWatchData | null> {
  const res = await fetch(`/api/title-watch${refresh ? '?refresh=1' : ''}`)
  if (!res.ok) return null
  return res.json()
}

/** The permanent watch list on its own — cheap next to a full roster fetch. */
export async function fetchPermaWatch(): Promise<CharacterInput[]> {
  const res = await fetch('/api/title-watch?view=perma')
  if (!res.ok) return []
  const data = await res.json() as { perma?: CharacterInput[] }
  return data.perma ?? []
}

// Both writes hand back the updated list so callers can settle their local copy
// against the server instead of trusting an optimistic guess.
export async function addPermaWatch(char: CharacterInput): Promise<CharacterInput[] | null> {
  const res = await fetch('/api/title-watch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(char),
  })
  if (!res.ok) return null
  const data = await res.json() as { perma?: CharacterInput[] }
  return data.perma ?? []
}

export async function removePermaWatch(char: CharacterInput): Promise<CharacterInput[] | null> {
  const params = new URLSearchParams({ name: char.name, realm: char.realm, region: char.region })
  const res = await fetch(`/api/title-watch?${params}`, { method: 'DELETE' })
  if (!res.ok) return null
  const data = await res.json() as { perma?: CharacterInput[] }
  return data.perma ?? []
}

export interface CommandRoomPlayer {
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

export interface CommandRoomData {
  updatedAt: number
  season: string
  region: string
  /** Points either side of the cutoff this band was collected for. */
  window: number
  cutoff: { score: number; percentile: string; rank: number }
  players: CommandRoomPlayer[]
}

/** Bands the picker offers. The API clamps anything outside 5–50. */
export const ROOM_WINDOW_PRESETS: readonly number[] = [5, 10, 15, 25, 50]
export const ROOM_WINDOW_DEFAULT = 15

/** `pts` is how far either side of the cutoff to sweep raider.io for streams. */
export async function fetchCommandRoom(pts: number, refresh = false): Promise<CommandRoomData | null> {
  const params = new URLSearchParams({ view: 'command-room', window: String(pts) })
  if (refresh) params.set('refresh', '1')
  const res = await fetch(`/api/title-watch?${params}`)
  if (!res.ok) return null
  return res.json()
}
