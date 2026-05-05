export interface CharacterInput {
  name: string
  realm: string
  region: string
}

export interface BestRun {
  shortName: string
  dungeon: string
  level: number
  role: 'tank' | 'healer' | 'dps'
  specName: string
  completedAt: string
  clearTimeMs: number
  parTimeMs: number
  numUpgrades: number
  score: number
  url: string
}

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface HistoryPoint {
  date: string
  score: number | null
}

export interface RoleScores {
  tank: number
  dps: number
  healer: number
}

export interface CharacterEntry extends CharacterInput {
  id: string
  status: FetchStatus
  score?: number
  scoreDelta?: number
  prevRank?: number
  isOwned?: boolean
  race?: string
  gender?: string
  className?: string
  specName?: string
  thumbnailUrl?: string
  profileUrl?: string
  roleScores?: RoleScores
  bestRuns?: BestRun[]
  error?: string
  history?: HistoryPoint[]
}

export interface VoteRecord {
  charKey: string
  name: string
  realm: string
  region: string
  className?: string
  specName?: string
  thumbnailUrl?: string
  yesVotes: string[]
  noVotes: string[]
  expiresAt: number
  resolved?: boolean
  failed?: boolean
}
