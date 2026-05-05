import { useState } from 'react'
import type { RankCutoff } from '../solo-queue'

const TIER_COLORS: Record<string, string> = {
  Challenger:  '#f4d03f',
  Grandmaster: '#e8253b',
  Master:      '#9b59b6',
  Diamond:     '#4fc3f7',
  Emerald:     '#2ecc71',
  Platinum:    '#1abc9c',
  Gold:        '#f39c12',
  Silver:      '#95a5a6',
  Bronze:      '#cd7f32',
  Iron:        '#7f8c8d',
}

interface TierGroup {
  tier: string
  color: string
  rows: RankCutoff[]
  entryScore: number
}

function groupByTier(cutoffs: RankCutoff[]): TierGroup[] {
  const groups: TierGroup[] = []
  let current: TierGroup | null = null
  for (const r of cutoffs) {
    if (!current || current.tier !== r.tier) {
      current = { tier: r.tier, color: TIER_COLORS[r.tier] ?? '#aaa', rows: [], entryScore: 0 }
      groups.push(current)
    }
    current.rows.push(r)
  }
  return groups.map(g => ({ ...g, entryScore: g.rows[g.rows.length - 1].minScore }))
}

export function SoloQueueTiers({ cutoffs, titleScore }: { cutoffs: RankCutoff[]; titleScore?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (cutoffs.length === 0) return null

  const groups = groupByTier(cutoffs)

  function toggle(tier: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(tier) ? next.delete(tier) : next.add(tier)
      return next
    })
  }

  // Index of the first group whose entry score is at or below the title cutoff — the line appears above it.
  const titleInsertIdx = titleScore != null
    ? groups.findIndex(g => titleScore >= g.entryScore)
    : -1

  return (
    <div className="sq-tiers">
      <p className="sq-tiers-title">Solo Queue</p>
      <div className="sq-tree">
        {groups.map((group, i) => {
          const hasDivisions = group.rows.length > 1
          const isOpen = expanded.has(group.tier)
          return (
            <div key={group.tier}>
              {i === titleInsertIdx && titleScore != null && (
                <div className="sq-title-cutoff">
                  <span className="sq-title-cutoff-label">Title</span>
                  <div className="sq-title-cutoff-line" />
                  <span className="sq-title-cutoff-score">
                    {Math.round(titleScore).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="sq-group">
                <div
                  className={`sq-tier-row${hasDivisions ? ' sq-tier-row--expandable' : ''}`}
                  onClick={() => hasDivisions && toggle(group.tier)}
                >
                  <span className="sq-chevron">{hasDivisions ? (isOpen ? '▾' : '▸') : ''}</span>
                  <span className="sq-tier-name" style={{ color: group.color }}>{group.tier}</span>
                  <span className="sq-score">
                    {group.entryScore > 0 ? `≥ ${group.entryScore.toLocaleString()}` : 'any'}
                  </span>
                </div>
                {isOpen && (
                  <div className="sq-divisions">
                    {group.rows.map(r => (
                      <div key={r.label} className="sq-div-row">
                        <span className="sq-div-label" style={{ color: group.color }}>{r.division}</span>
                        <span className="sq-score">≥ {r.minScore.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
