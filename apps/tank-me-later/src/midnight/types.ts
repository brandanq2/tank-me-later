import type { CharacterInput } from '@tml/shared/types'
import type { RaidRole } from './specs'

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
  /**
   * The spec the player intends to bring, which is not necessarily whatever
   * they happen to be logged in as — so it is chosen by hand and stored here
   * rather than read back off raider.io at render time.
   */
  className: string
  specName: string
  /** Derived from class + spec at signup, and what the roster groups on. */
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
