import type { CharacterInput } from '@tml/shared/types'

export type RaidRole = 'tank' | 'healer' | 'dps'

export const RAID_ROLES: RaidRole[] = ['tank', 'healer', 'dps']

export const ROLE_LABELS: Record<RaidRole, string> = {
  tank: 'Tank',
  healer: 'Healer',
  dps: 'DPS',
}

/** One warband's weekly evening availability, as half-hour cell keys. */
export interface AvailabilityRecord {
  warbandId: string
  slots: string[]
  note?: string
  updatedAt: number
}

/** The three-hour window an organizer has locked in for the team. */
export interface RaidSlotRecord {
  id: string
  day: string
  /** Minutes past midnight, so a stored slot survives grid-range changes. */
  startMinutes: number
  lockedAt: number
}

export interface SignupRecord {
  warbandId: string
  character: CharacterInput
  role: RaidRole
  note?: string
  signedUpAt: number
}

/** Everything the page needs, in one request. */
export interface MidnightState {
  role: 'member' | 'organizer'
  availability: AvailabilityRecord[]
  raidSlot: RaidSlotRecord | null
  signups: SignupRecord[]
}
