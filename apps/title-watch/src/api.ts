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

export async function addPermaWatch(char: CharacterInput): Promise<boolean> {
  const res = await fetch('/api/title-watch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(char),
  })
  return res.ok
}

export async function removePermaWatch(char: CharacterInput): Promise<boolean> {
  const params = new URLSearchParams({ name: char.name, realm: char.realm, region: char.region })
  const res = await fetch(`/api/title-watch?${params}`, { method: 'DELETE' })
  return res.ok
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
  cutoff: { score: number; percentile: string; rank: number }
  players: CommandRoomPlayer[]
}

export async function fetchCommandRoom(refresh = false): Promise<CommandRoomData | null> {
  const res = await fetch(`/api/title-watch?view=command-room${refresh ? '&refresh=1' : ''}`)
  if (!res.ok) return null
  return res.json()
}
