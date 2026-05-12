import { useState } from 'react'
import type { BestRun, HistoryPoint, WarbandRun } from '../types'
import { KeyDetailModal } from './KeyDetailModal'
import { easternDateString } from '../today'

const CLASS_COLORS: Record<string, string> = {
  'Death Knight': '#C41E3A',
  'Demon Hunter': '#A330C9',
  Druid: '#FF7C0A',
  Evoker: '#33937F',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Monk: '#00FF98',
  Paladin: '#F48CBA',
  Priest: '#FFFFFF',
  Rogue: '#FFF468',
  Shaman: '#0070DD',
  Warlock: '#8788EE',
  Warrior: '#C69B3A',
}

type RunLike = BestRun & { characterName?: string; characterClass?: string }

interface Props {
  runs: RunLike[]
  fallbackCharacterName?: string
  fallbackCharacterClass?: string
  days?: number
  history?: HistoryPoint[]
  currentScore?: number
}

function formatDayLabel(dateStr: string): string {
  const today = easternDateString(new Date())
  if (dateStr === today) return 'Today'
  const yesterday = easternDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))
  if (dateStr === yesterday) return 'Yesterday'
  const [, m, d] = dateStr.split('-')
  const date = new Date(`${dateStr}T12:00:00Z`)
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' })
  return `${weekday} ${parseInt(m)}/${parseInt(d)}`
}

// Each day's IO gain is the chart segment that *starts* at this date.
// Keys timed during Eastern day D show up in the snapshot taken at the
// start of D+1, so the visible rise after D's chart point is the gain
// to attribute to D's bucket. For the latest charted date, use the next
// chart point (which may be the appended currentScore).
function computeDayDelta(
  date: string,
  sortedChartDates: string[],
  scoreByDate: Map<string, number>,
): number | null {
  const idx = sortedChartDates.indexOf(date)
  if (idx === -1 || idx + 1 >= sortedChartDates.length) return null
  const start = scoreByDate.get(date)!
  const end = scoreByDate.get(sortedChartDates[idx + 1])!
  return Math.max(0, end - start)
}

export function KeyTimeline({ runs, fallbackCharacterName, fallbackCharacterClass, days = 7, history, currentScore }: Props) {
  const [selectedRun, setSelectedRun] = useState<RunLike | null>(null)

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
  const byDate = new Map<string, RunLike[]>()
  for (const run of runs) {
    if (!run.completedAt) continue
    const ts = new Date(run.completedAt).getTime()
    if (isNaN(ts) || ts < cutoffMs) continue
    const date = easternDateString(new Date(ts))
    const bucket = byDate.get(date) ?? []
    bucket.push(run)
    byDate.set(date, bucket)
  }

  if (byDate.size === 0) {
    return <p className="cm-no-history">No key timings in the past {days} days.</p>
  }

  // Build the same point set the chart plots: snapshot scores + currentScore
  // appended as today's point if today isn't already in history.
  const scoreByDate = new Map<string, number>()
  for (const point of history ?? []) {
    if (point.score != null) scoreByDate.set(point.date, point.score)
  }
  const today = easternDateString(new Date())
  if (currentScore != null && !scoreByDate.has(today)) {
    scoreByDate.set(today, currentScore)
  }
  const sortedChartDates = [...scoreByDate.keys()].sort()

  const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a))

  return (
    <>
      <div className="key-timeline">
        {sortedDates.map(date => {
          const dayRuns = byDate.get(date)!.sort((a, b) => b.score - a.score)
          const delta = computeDayDelta(date, sortedChartDates, scoreByDate)
          return (
            <div key={date} className="key-timeline-day">
              <div className="key-timeline-date">
                <span>{formatDayLabel(date)}</span>
                <span className="key-timeline-day-score">
                  {dayRuns.length} key{dayRuns.length === 1 ? '' : 's'}
                  {delta != null && delta > 0 && (
                    <> · +{delta.toLocaleString(undefined, { maximumFractionDigits: 1 })} IO</>
                  )}
                </span>
              </div>
              <div className="key-timeline-keys">
                {dayRuns.map((run, i) => {
                  const charName = run.characterName ?? fallbackCharacterName
                  const charClass = run.characterClass ?? fallbackCharacterClass
                  const showChar = !!run.characterName
                  return (
                    <div
                      key={`${date}-${run.shortName}-${i}`}
                      className={`key-chip key-chip-${run.role} key-chip-clickable`}
                      title={`${run.dungeon} +${run.level}${charName ? ` — ${charName}` : ''}`}
                      onClick={() => setSelectedRun({ ...run, characterName: charName, characterClass: charClass })}
                      role="button"
                    >
                      <span className="key-chip-name">{run.shortName}</span>
                      <span className="key-chip-level">+{run.level}</span>
                      {showChar && charName && (
                        <span
                          className="key-chip-char"
                          style={{ color: charClass ? CLASS_COLORS[charClass] ?? '#aaa' : undefined }}
                        >
                          {charName}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {selectedRun && (
        <KeyDetailModal
          run={selectedRun}
          characterName={selectedRun.characterName ?? fallbackCharacterName ?? ''}
          characterClass={selectedRun.characterClass ?? fallbackCharacterClass}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </>
  )
}
