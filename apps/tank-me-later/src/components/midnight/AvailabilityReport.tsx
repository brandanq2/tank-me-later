import { RAID_BLOCKS, raidSlotLabel, type RaidSlot } from '../../midnight/schedule'
import { topSlots, type ScheduleReport, type SlotAnalysis } from '../../midnight/report'

interface Props {
  report: ScheduleReport
  /** Organizers get a lock button on each candidate window. */
  onLock?: (slot: RaidSlot) => void
  lockedSlotId?: string | null
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function names(list: { name: string }[]): string {
  return list.map(w => w.name).join(', ')
}

/** "Nobody is missing" reads better than an empty list. */
function SlotRow({ analysis, total, onLock, locked }: {
  analysis: SlotAnalysis
  total: number
  onLock?: (slot: RaidSlot) => void
  locked: boolean
}) {
  const { full, partial, missing } = analysis
  return (
    <li className={'mn-rep-slot' + (locked ? ' is-locked' : '')}>
      <div className="mn-rep-slot-head">
        <span className="mn-rep-slot-when">{raidSlotLabel(analysis.slot)}</span>
        <span className="mn-rep-slot-count">{full.length}/{total}</span>
        {locked && <span className="mn-rep-locked-tag">locked in</span>}
        {onLock && !locked && (
          <button className="mn-rep-lock-btn" onClick={() => onLock(analysis.slot)}>
            Lock this slot
          </button>
        )}
      </div>
      <p className="mn-rep-slot-detail">
        {full.length > 0
          ? <><b>All three hours:</b> {names(full)}.</>
          : <><b>Nobody</b> can make the full three hours.</>}
      </p>
      {partial.length > 0 && (
        <p className="mn-rep-slot-detail mn-rep-partial">
          <b>Partial:</b>{' '}
          {partial.map(p => `${p.warband.name} (${p.blocks}/${RAID_BLOCKS})`).join(', ')}.
        </p>
      )}
      {missing.length > 0 && (
        <p className="mn-rep-slot-detail mn-rep-missing">
          <b>Out:</b> {names(missing)}.
        </p>
      )}
    </li>
  )
}

export function AvailabilityReport({ report, onLock, lockedSlotId }: Props) {
  const { responded, ranked, bestTurnout } = report
  const total = responded.length
  const best = ranked[0]

  if (total === 0) {
    return (
      <p className="empty">
        Nothing to report yet. Once warbands submit their evenings, the best
        three-hour windows show up here.
      </p>
    )
  }

  // A window everyone can make is the goal; say so plainly when one exists.
  const perfect = ranked.filter(s => s.full.length === total)
  const tiedWithBest = ranked.filter(s => s.full.length === bestTurnout)

  return (
    <div className="mn-report">
      <p className="mn-rep-lede">
        {plural(total, 'warband')} {total === 1 ? 'has' : 'have'} submitted availability.{' '}
        {perfect.length > 0 ? (
          <>
            <b>{plural(perfect.length, 'window')}</b> {perfect.length === 1 ? 'works' : 'work'} for
            everyone who has responded — the earliest is{' '}
            <b>{raidSlotLabel(perfect[0].slot)}</b>.
          </>
        ) : (
          <>
            No window reaches everyone. The best turnout is <b>{bestTurnout} of {total}</b>
            {' '}at <b>{best && raidSlotLabel(best.slot)}</b>
            {tiedWithBest.length > 1 && <> ({tiedWithBest.length - 1} other {tiedWithBest.length === 2 ? 'window ties' : 'windows tie'} it)</>}.
          </>
        )}
      </p>

      <h3 className="mn-rep-heading">Best windows</h3>
      <ol className="mn-rep-slots">
        {topSlots(report, 5).map(analysis => (
          <SlotRow
            key={analysis.id}
            analysis={analysis}
            total={total}
            onLock={onLock}
            locked={analysis.id === lockedSlotId}
          />
        ))}
      </ol>
    </div>
  )
}
