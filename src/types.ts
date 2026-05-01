export interface CharacterInput {
  name: string
  realm: string
  region: string
}

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface TopKey {
  dungeon: string
  shortName: string
  level: number
  levelDelta?: number
}

export interface CharacterEntry extends CharacterInput {
  id: string
  status: FetchStatus
  score?: number
  scoreDelta?: number
  topKeys?: TopKey[]
  className?: string
  specName?: string
  thumbnailUrl?: string
  profileUrl?: string
  error?: string
}
