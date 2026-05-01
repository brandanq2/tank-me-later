export interface CharacterInput {
  name: string
  realm: string
  region: string
}

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface CharacterEntry extends CharacterInput {
  id: string
  status: FetchStatus
  score?: number
  scoreDelta?: number
  prevRank?: number
  isOwned?: boolean
  className?: string
  specName?: string
  thumbnailUrl?: string
  profileUrl?: string
  error?: string
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
}
