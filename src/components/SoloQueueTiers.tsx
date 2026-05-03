import { getRankCutoffs } from '../solo-queue'
import type { ScoreAnchor } from '../solo-queue'

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

interface Props {
  anchors: ScoreAnchor[]
}

export function SoloQueueTiers({ anchors }: Props) {
  if (anchors.length === 0) return null

  const cutoffs = getRankCutoffs(anchors)

  return (
    <div className="sq-tiers">
      <h2 className="sq-tiers-title">Solo Queue Tier Cutoffs</h2>
      <p className="sq-tiers-sub">Minimum Tank IO score per rank · live from Raider.io</p>
      <div className="sq-tiers-grid">
        {cutoffs.map(r => (
          <div key={r.label} className="sq-tier-row">
            <span
              className="sq-tier-badge"
              style={{ color: TIER_COLORS[r.tier], borderColor: TIER_COLORS[r.tier] }}
            >
              {r.label}
            </span>
            <span className="sq-tier-score">
              {r.minScore > 0
                ? `≥ ${r.minScore.toLocaleString()}`
                : 'any'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
