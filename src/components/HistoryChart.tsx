import type { HistoryPoint } from '../types'

interface Props {
  history: HistoryPoint[]
  currentScore?: number
  color: string
  idSuffix: string
}

export function HistoryChart({ history, currentScore, color, idSuffix }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const histPoints = history.filter(h => h.score !== null) as { date: string; score: number }[]
  const lastIsToday = histPoints.length > 0 && histPoints[histPoints.length - 1].date === today
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
  const gradId = `hc-${idSuffix}`

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
