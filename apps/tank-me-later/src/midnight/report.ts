import {
  BLOCKS, CANDIDATE_SLOTS, DAYS, RAID_BLOCKS, cellKey, raidSlotCells, raidSlotId,
  type Day, type RaidSlot,
} from './schedule'
import type { AvailabilityRecord } from './types'

/** A warband as the scheduler cares about it: a name and a roster size. */
export interface WarbandRef {
  id: string
  name: string
  memberCount: number
}

export interface PartialAvailability {
  warband: WarbandRef
  /** How many of the six blocks they cover. */
  blocks: number
}

export interface SlotAnalysis {
  id: string
  slot: RaidSlot
  /** Free for the whole three hours. */
  full: WarbandRef[]
  /** Free for part of it — sorted by coverage, best first. */
  partial: PartialAvailability[]
  /** No overlap with this window at all. */
  missing: WarbandRef[]
}

export interface ScheduleReport {
  /**
   * Warbands that have submitted availability. Deliberately the only notion of
   * roster here: the Strike Team is invited by hand, so a CLB warband that has
   * not filled the grid in is presumed uninvited rather than late.
   */
  responded: WarbandRef[]
  /** Every candidate window, best first. Empty when nobody has responded. */
  ranked: SlotAnalysis[]
  /** Cell key → the warbands free in that half hour. */
  cellAvailability: Map<string, WarbandRef[]>
  /** The most warbands any single window can reach. */
  bestTurnout: number
}

/**
 * Ranks windows by how many warbands can make the whole three hours, then by
 * how close the rest come. Ties break toward earlier in the week and earlier in
 * the evening, so a coin-flip lands on the more raid-friendly option.
 */
function compareSlots(a: SlotAnalysis, b: SlotAnalysis): number {
  if (a.full.length !== b.full.length) return b.full.length - a.full.length
  const partialA = a.partial.reduce((sum, p) => sum + p.blocks, 0)
  const partialB = b.partial.reduce((sum, p) => sum + p.blocks, 0)
  if (partialA !== partialB) return partialB - partialA
  const dayDelta = DAYS.indexOf(a.slot.day) - DAYS.indexOf(b.slot.day)
  if (dayDelta !== 0) return dayDelta
  return a.slot.block - b.slot.block
}

function analyzeSlot(
  slot: RaidSlot,
  respondedRefs: WarbandRef[],
  slotsByWarband: Map<string, Set<string>>,
): SlotAnalysis {
  const cells = raidSlotCells(slot)
  const full: WarbandRef[] = []
  const partial: PartialAvailability[] = []
  const missing: WarbandRef[] = []

  for (const warband of respondedRefs) {
    const marked = slotsByWarband.get(warband.id)
    const covered = marked ? cells.filter(c => marked.has(c)).length : 0
    if (covered === RAID_BLOCKS) full.push(warband)
    else if (covered > 0) partial.push({ warband, blocks: covered })
    else missing.push(warband)
  }

  partial.sort((a, b) => b.blocks - a.blocks || a.warband.name.localeCompare(b.warband.name))
  return { id: raidSlotId(slot), slot, full, partial, missing }
}

export function buildReport(
  availability: AvailabilityRecord[],
  warbands: WarbandRef[],
): ScheduleReport {
  const byId = new Map(warbands.map(w => [w.id, w]))

  // Availability can outlive a warband that was deleted on the CLB page, so
  // records with no matching warband are dropped rather than shown nameless.
  const records = availability.filter(r => byId.has(r.warbandId) && r.slots.length > 0)
  const respondedIds = new Set(records.map(r => r.warbandId))
  const responded = warbands.filter(w => respondedIds.has(w.id))

  const slotsByWarband = new Map(records.map(r => [r.warbandId, new Set(r.slots)]))

  const cellAvailability = new Map<string, WarbandRef[]>()
  for (const day of DAYS) {
    for (const block of BLOCKS) {
      const key = cellKey(day as Day, block)
      const free = responded.filter(w => slotsByWarband.get(w.id)?.has(key))
      cellAvailability.set(key, free)
    }
  }

  const ranked = responded.length === 0
    ? []
    : CANDIDATE_SLOTS.map(slot => analyzeSlot(slot, responded, slotsByWarband)).sort(compareSlots)

  return {
    responded,
    ranked,
    cellAvailability,
    bestTurnout: ranked[0]?.full.length ?? 0,
  }
}

/** Windows that reach as many warbands as the very best one does. */
export function topSlots(report: ScheduleReport, limit = 5): SlotAnalysis[] {
  return report.ranked.slice(0, limit)
}
