import { scoreToRankFromCutoffs, getNextRankInfoFromCutoffs } from '../solo-queue'
import type { RankCutoff } from '../solo-queue'
import type { CharacterEntry } from '../types'
import { HistoryChart } from './HistoryChart'
import { KeyTimeline } from './KeyTimeline'

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
  entry: CharacterEntry
  leaderRank: number
  classColor: string
  soloMapping?: RankCutoff[]
  onClose: () => void
}

export function CharacterModal({ entry, leaderRank, classColor, soloMapping, onClose }: Props) {
  const score = entry.score ?? 0
  const rank = soloMapping && soloMapping.length > 0 ? scoreToRankFromCutoffs(score, soloMapping) : null
  const nextInfo = soloMapping && soloMapping.length > 0 ? getNextRankInfoFromCutoffs(score, soloMapping) : null
  const rankColor = rank ? TIER_COLORS[rank.tier] ?? '#aaa' : classColor

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-panel" onClick={e => e.stopPropagation()} style={{ '--rank-color': rankColor } as React.CSSProperties}>
        <button className="cm-close" onClick={onClose}>✕</button>

        <div className="cm-header">
          {entry.thumbnailUrl && (
            <img
              className="cm-avatar"
              src={entry.thumbnailUrl}
              onError={e => { (e.currentTarget as HTMLImageElement).src = entry.thumbnailUrl! }}
              alt={entry.name}
            />
          )}
          <div className="cm-identity">
            <span className="cm-name" style={{ color: classColor }}>{entry.name}</span>
            <span className="cm-sub">{entry.specName} {entry.className}</span>
            <span className="cm-sub cm-realm">{entry.realm} · {entry.region?.toUpperCase()}</span>
            <span className="cm-lb-rank">#{leaderRank} on leaderboard</span>
          </div>
          <div className="cm-score-block">
            <span className="cm-score">{score.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            <span className="cm-score-label">Tank IO</span>
            {rank && (
              <span className="cm-rank-badge" style={{ color: rankColor, borderColor: rankColor }}>
                {rank.label}
              </span>
            )}
            {nextInfo && (
              <span className="cm-next-rank">
                ↑ {nextInfo.pointsNeeded.toLocaleString()} pts to {nextInfo.nextRank.label}
              </span>
            )}
          </div>
        </div>

        {(entry.history?.length ?? 0) > 0 && (
          <div className="cm-section">
            <p className="cm-section-label">Score History</p>
            <HistoryChart
              history={entry.history!}
              currentScore={entry.score}
              color={rankColor}
              idSuffix={entry.id}
            />
          </div>
        )}

        {(entry.bestRuns?.length ?? 0) > 0 && (
          <div className="cm-section">
            <p className="cm-section-label">Key Timings · Past Week</p>
            <KeyTimeline
              runs={entry.bestRuns!}
              fallbackCharacterName={entry.name}
              fallbackCharacterClass={entry.className}
            />
          </div>
        )}

        {entry.profileUrl && (
          <a className="cm-profile-link" href={entry.profileUrl} target="_blank" rel="noopener noreferrer">
            View on Raider.io ↗
          </a>
        )}
      </div>
    </div>
  )
}
