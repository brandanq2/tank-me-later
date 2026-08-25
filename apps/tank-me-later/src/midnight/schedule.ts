/**
 * The weekly evening grid every Midnight raider fills out.
 *
 * Everything is in one fixed timezone (US Eastern) on purpose: the labels *are*
 * the times, so no conversion happens anywhere in the app and two players
 * comparing screenshots always see the same grid.
 *
 * Kept in sync by hand with the validation constants in api/midnight.ts.
 */

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Day = (typeof DAYS)[number]

export const DAY_LABELS: Record<Day, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

export const DAY_SHORT: Record<Day, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

/** The grid opens at 2:00 PM and closes at 1:00 AM the next morning. */
export const GRID_START_MINUTES = 14 * 60
export const GRID_END_MINUTES = 25 * 60
export const BLOCK_MINUTES = 30
export const BLOCKS_PER_DAY = (GRID_END_MINUTES - GRID_START_MINUTES) / BLOCK_MINUTES

/** A raid slot is three hours, i.e. six half-hour blocks. */
export const RAID_BLOCKS = 6

/** Latest block a three-hour raid can start on and still fit in the day. */
export const LAST_RAID_START = BLOCKS_PER_DAY - RAID_BLOCKS

/** Minutes past midnight for a block. Values over 1440 are after midnight. */
export function blockStartMinutes(block: number): number {
  return GRID_START_MINUTES + block * BLOCK_MINUTES
}

/** Inverse of blockStartMinutes — turns a stored wall-clock minute into a row. */
export function blockFromMinutes(minutes: number): number {
  return (minutes - GRID_START_MINUTES) / BLOCK_MINUTES
}

export const TIMEZONE_LABEL = 'ET'

export const BLOCKS: number[] = Array.from({ length: BLOCKS_PER_DAY }, (_, i) => i)

export interface RaidSlot {
  day: Day
  block: number
}

/**
 * Cell keys store the wall-clock minute rather than the block index, so
 * widening the grid never re-interprets availability people already saved.
 * `wed:1230` is Wednesday 8:30 PM whatever hour the grid happens to start at.
 */
export function cellKey(day: Day, block: number): string {
  return `${day}:${blockStartMinutes(block)}`
}

export function parseCellKey(key: string): { day: Day; block: number } | null {
  const [day, rawMinutes] = key.split(':')
  const minutes = Number(rawMinutes)
  if (!DAYS.includes(day as Day)) return null
  if (!Number.isInteger(minutes)) return null
  const offset = minutes - GRID_START_MINUTES
  if (offset < 0 || offset % BLOCK_MINUTES !== 0) return null
  const block = offset / BLOCK_MINUTES
  return block < BLOCKS_PER_DAY ? { day: day as Day, block } : null
}

function formatMinutes(total: number): string {
  const mins = ((total % 1440) + 1440) % 1440
  const hours24 = Math.floor(mins / 60)
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  const minutes = mins % 60
  return minutes === 0 ? `${hours12} ${suffix}` : `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/** The grid's span in words, derived from the constants so it cannot drift. */
export const GRID_LABEL = `${formatMinutes(GRID_START_MINUTES)} to ${formatMinutes(GRID_END_MINUTES)}`

/** Start of a block, e.g. "8:30 PM". */
export function blockLabel(block: number): string {
  return formatMinutes(blockStartMinutes(block))
}

/** End of a block — half an hour after it starts. */
export function blockEndLabel(block: number): string {
  return formatMinutes(blockStartMinutes(block + 1))
}

/** The three hours a raid starting on `block` would cover. */
export function raidTimeLabel(block: number): string {
  const start = formatMinutes(blockStartMinutes(block))
  const end = formatMinutes(blockStartMinutes(block + RAID_BLOCKS))
  return `${start} – ${end} ${TIMEZONE_LABEL}`
}

/** Same `day:wall-clock-minute` shape as cell keys, so the two never diverge. */
export function raidSlotId(slot: RaidSlot): string {
  return `${slot.day}:${blockStartMinutes(slot.block)}`
}

export function raidSlotLabel(slot: RaidSlot): string {
  return `${DAY_LABELS[slot.day]}, ${raidTimeLabel(slot.block)}`
}

export function raidSlotShortLabel(slot: RaidSlot): string {
  return `${DAY_SHORT[slot.day]} ${raidTimeLabel(slot.block)}`
}

/** The six cell keys a raid starting at `slot` occupies. */
export function raidSlotCells(slot: RaidSlot): string[] {
  return Array.from({ length: RAID_BLOCKS }, (_, i) => cellKey(slot.day, slot.block + i))
}

/** Every three-hour window that fits inside the grid — 11 per night. */
export const CANDIDATE_SLOTS: RaidSlot[] = DAYS.flatMap(day =>
  Array.from({ length: LAST_RAID_START + 1 }, (_, block) => ({ day, block })),
)
