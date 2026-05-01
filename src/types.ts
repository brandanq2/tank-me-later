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
  className?: string
  specName?: string
  thumbnailUrl?: string
  profileUrl?: string
  error?: string
}
