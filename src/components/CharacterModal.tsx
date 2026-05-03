import { scoreToRank, getNextRankInfo } from '../solo-queue'
import type { ScoreAnchor } from '../solo-queue'
import type { CharacterEntry } from '../types'

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

function HistoryChart({ entry, color }: { entry: CharacterEntry; color: string }) {
  const today = new Date().toISOString().split('T')[0]
  const histPoints = (entry.history ?? []).filter(h => h.score !== null) as { date: string; score: number }[]
  const lastIsToday = histPoints.length > 0 && histPoints[histPoints.length - 1].date === today
  const currentScore = entry.score ?? undefined
  const points = currentScore != null && !lastIsToday
    ? [...histPoints, { date: today, score: currentScore }]
    : histPoints
  const currentIdx = currentScore != null && !lastIsToday ? points.length - 1 : -1

  if (points.length < 2) return <p className="cm-no-history">No history yet.</p>

  const W = 400, SCORE_H = 20, CHART_H = 130, LABEL_H = 22, H = SCORE_H + CHART_H + LABEL_H, PAD = 18
  const scores = points.map(p => p.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1

  const px = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const py = (s: number) => SCORE_H + PAD + ((max - s) / range) * (CHART_H - PAD * 2)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.score).toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${px(points.length - 1).toFixed(1)},${SCORE_H + CHART_H} L${px(0).toFixed(1)},${SCORE_H + CHART_H} Z`
  const gradId = `cm-${entry.id}`

  return (
    <svg width={W} height={H} className="cm-chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="#110c0b" />
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      {points.map((p, i) => (
        i === currentIdx
          ? <g key={i}>
              <circle cx={px(i)} cy={py(p.score)} r="7" fill="none" stroke={color} strokeWidth="1.5" opacity="0.3" />
              <circle cx={px(i)} cy={py(p.score)} r="4" fill="#fff" />
            </g>
          : <circle key={i} cx={px(i)} cy={py(p.score)} r="3.5" fill={color} opacity="0.85" />
      ))}
      {points.map((p, i) => (
        <text key={i} x={px(i).toFixed(1)} y={H - 5} textAnchor="middle" fontSize="10" fill={i === currentIdx ? '#fff' : color} opacity={i === currentIdx ? 1 : 0.7}>
          {i === currentIdx ? 'Now' : (() => { const [, m, d] = p.date.split('-'); return `${m}/${d}` })()}
        </text>
      ))}
      {points.map((p, i) => (
        <text key={`s-${i}`} x={px(i).toFixed(1)} y={(py(p.score) - 10).toFixed(1)} textAnchor="middle" fontSize="10" fill={i === currentIdx ? '#fff' : color} opacity={i === currentIdx ? 1 : 0.75} fontWeight={i === currentIdx ? 'bold' : 'normal'}>
          {p.score.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </text>
      ))}
    </svg>
  )
}

interface Props {
  entry: CharacterEntry
  leaderRank: number
  classColor: string
  soloAnchors?: ScoreAnchor[]
  onClose: () => void
}

export function CharacterModal({ entry, leaderRank, classColor, soloAnchors, onClose }: Props) {
  const score = entry.score ?? 0
  const rank = soloAnchors && soloAnchors.length > 0 ? scoreToRank(score, soloAnchors) : null
  const nextInfo = soloAnchors && soloAnchors.length > 0 ? getNextRankInfo(score, soloAnchors) : null
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
            <HistoryChart entry={entry} color={rankColor} />
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
