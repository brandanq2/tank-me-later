import {
  BLOCKS, DAYS, DAY_SHORT, RAID_BLOCKS, TIMEZONE_LABEL, blockEndLabel, blockLabel,
  cellKey, raidSlotCells, type Day, type RaidSlot,
} from '../../midnight/schedule'
import type { ScheduleReport } from '../../midnight/report'

interface Props {
  report: ScheduleReport
  /** Outlined on the calendar so the chosen window is easy to eyeball. */
  highlight?: RaidSlot | null
}

/** Five shades so the eye can rank turnout without reading every number. */
function heatLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0
  return Math.min(4, Math.ceil((count / max) * 4))
}

export function AvailabilityCalendar({ report, highlight }: Props) {
  const { cellAvailability, responded } = report
  const max = responded.length

  const highlightCells = highlight ? new Set(raidSlotCells(highlight)) : null

  if (responded.length === 0) {
    return <p className="empty">No availability submitted yet — be the first to fill in the grid above.</p>
  }

  return (
    <>
      <div className="mn-cal">
        <div className="mn-grid-corner">{TIMEZONE_LABEL}</div>
        {DAYS.map(day => (
          <div key={day} className="mn-cal-dayhead">{DAY_SHORT[day]}</div>
        ))}

        {BLOCKS.flatMap(block => [
          <div key={`t${block}`} className="mn-cal-timehead">{blockLabel(block)}</div>,
          ...DAYS.map(day => {
            const key = cellKey(day as Day, block)
            const free = cellAvailability.get(key) ?? []
            const names = free.map(w => w.name).join(', ')
            return (
              <div
                key={key}
                className={
                  `mn-cal-cell mn-heat-${heatLevel(free.length, max)}` +
                  (highlightCells?.has(key) ? ' is-slot' : '')
                }
                title={
                  `${DAY_SHORT[day as Day]} ${blockLabel(block)}–${blockEndLabel(block)}\n` +
                  `${free.length}/${max} available` + (names ? `\n${names}` : '')
                }
              >
                {free.length > 0 ? free.length : ''}
              </div>
            )
          }),
        ])}
      </div>

      <div className="mn-cal-legend">
        <span className="mn-cal-legend-label">Warbands free</span>
        <span className="mn-cal-legend-swatch mn-heat-0" />
        <span className="mn-cal-legend-swatch mn-heat-1" />
        <span className="mn-cal-legend-swatch mn-heat-2" />
        <span className="mn-cal-legend-swatch mn-heat-3" />
        <span className="mn-cal-legend-swatch mn-heat-4" />
        <span className="mn-cal-legend-label">{max} of {max}</span>
        <span className="mn-cal-legend-note">
          Hover a half hour to see who. A raid needs {RAID_BLOCKS} in a row.
        </span>
      </div>
    </>
  )
}
