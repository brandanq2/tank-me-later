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

/** Evenings only — the grid opens at 5:00 PM and closes at 1:00 AM. */
export const GRID_START_MINUTES = 17 * 60
export const BLOCK_MINUTES = 30
export const BLOCKS_PER_DAY = 16

/** A raid slot is three hours, i.e. six half-hour blocks. */
export const RAID_BLOCKS = 6

/** Latest block a three-hour raid can start on and still fit in the evening. */
export const LAST_RAID_START = BLOCKS_PER_DAY - RAID_BLOCKS

export const TIMEZONE_LABEL = 'ET'

export const BLOCKS: number[] = Array.from({ length: BLOCKS_PER_DAY }, (_, i) => i)

export interface RaidSlot {
  day: Day
  block: number
}

export function cellKey(day: Day, block: number): string {
  return `${day}:${block}`
}

export function parseCellKey(key: string): { day: Day; block: number } | null {
  const [day, rawBlock] = key.split(':')
  const block = Number(rawBlock)
  if (!DAYS.includes(day as Day)) return null
  if (!Number.isInteger(block) || block < 0 || block >= BLOCKS_PER_DAY) return null
  return { day: day as Day, block }
}

function formatMinutes(total: number): string {
  const mins = ((total % 1440) + 1440) % 1440
  const hours24 = Math.floor(mins / 60)
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  const minutes = mins % 60
  return minutes === 0 ? `${hours12} ${suffix}` : `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/** Start of a block, e.g. block 6 → "8 PM". */
export function blockLabel(block: number): string {
  return formatMinutes(GRID_START_MINUTES + block * BLOCK_MINUTES)
}

/** End of a block, e.g. block 6 → "8:30 PM". */
export function blockEndLabel(block: number): string {
  return formatMinutes(GRID_START_MINUTES + (block + 1) * BLOCK_MINUTES)
}

/** The three hours a raid starting on `block` would cover. */
export function raidTimeLabel(block: number): string {
  const start = formatMinutes(GRID_START_MINUTES + block * BLOCK_MINUTES)
  const end = formatMinutes(GRID_START_MINUTES + (block + RAID_BLOCKS) * BLOCK_MINUTES)
  return `${start} – ${end} ${TIMEZONE_LABEL}`
}

export function raidSlotId(slot: RaidSlot): string {
  return `${slot.day}:${slot.block}`
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

/** Only meaningful for grid cells, not raid starts — used by the heatmap. */
export function isLateNight(block: number): boolean {
  return GRID_START_MINUTES + block * BLOCK_MINUTES >= 22 * 60
}
