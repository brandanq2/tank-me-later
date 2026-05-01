import { scoreToColor } from '../scoreColor'
import type { CharacterEntry, HistoryPoint, VoteRecord } from '../types'

interface Props {
  entry: CharacterEntry
  rank: number
  rankDelta?: number
  activeVote?: VoteRecord
  sessionId?: string
  cutoffScore: number
  revealed: boolean
  isInitialEntry: boolean
  revealDelay: number
  onRemove: (id: string) => void
  coverUrl?: string | null
  coverLoading?: boolean
  onOpenCover?: () => void
}

function revealClass(rank: number): string {
  if (rank === 1) return 'row-reveal-1'
  if (rank === 2) return 'row-reveal-2'
  if (rank === 3) return 'row-reveal-3'
  return 'row-reveal-rest'
}

const CLASS_TANK_SPEC: Record<string, string> = {
  'Death Knight': 'Blood',
  'Demon Hunter': 'Vengeance',
  Druid: 'Guardian',
  Monk: 'Brewmaster',
  Paladin: 'Protection',
  Warrior: 'Protection',
}

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

function RankBadge({ rank, delta }: { rank: number; delta?: number }) {
  const badge = rank === 0 ? <span className="rank">🤡</span>
    : rank === 1 ? <span className="rank rank-gold">1</span>
    : rank === 2 ? <span className="rank rank-silver">2</span>
    : rank === 3 ? <span className="rank rank-bronze">3</span>
    : <span className="rank">{rank}</span>

  if (delta == null || delta === 0 || rank === 0) return badge

  return (
    <div className="rank-wrap">
      {badge}
      <span className={`rank-delta ${delta > 0 ? 'rank-delta-up' : 'rank-delta-down'}`}>
        {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
      </span>
    </div>
  )
}

function Sparkline({ history, color, id }: { history: HistoryPoint[]; color: string; id: string }) {
  const points = history.filter(h => h.score !== null) as { date: string; score: number }[]
  if (points.length < 2) return null

  const W = 72, H = 34, PAD = 3
  const scores = points.map(p => p.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1

  const px = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const py = (s: number) => H - PAD - ((s - min) / range) * (H - PAD * 2)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.score).toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${px(points.length - 1).toFixed(1)},${H} L${px(0).toFixed(1)},${H} Z`
  const gradId = `sg-${id}`

  return (
    <svg width={W} height={H} className="sparkline">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      {points.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.score)} r="2" fill={color} />
      ))}
    </svg>
  )
}

function formatRemaining(expiresAt: number): string {
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'expired'
  const totalSecs = Math.ceil(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.ceil((totalSecs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`
}

function FailedStrip({ vote }: { vote: VoteRecord }) {
  return (
    <div className="vote-failed-strip">
      <span className="vote-failed-label">Vote Failed</span>
      <span className="vote-failed-sep">·</span>
      <span className="vote-failed-time">{formatRemaining(vote.expiresAt)}</span>
    </div>
  )
}

function VoteStrip({ vote }: { vote: VoteRecord }) {
  const slots: Array<'yes' | 'no' | 'pending'> = []
  for (let i = 0; i < 5; i++) {
    if (i < vote.yesVotes.length) slots.push('yes')
    else if (i < vote.yesVotes.length + vote.noVotes.length) slots.push('no')
    else slots.push('pending')
  }
  return (
    <div className="vote-strip" onClick={(e) => e.preventDefault()}>
      <span className="vote-strip-label">Vote to Remove</span>
      <div className="vote-strip-icons">
        {slots.map((s, i) => (
          <span key={i} className={`vote-strip-icon vote-strip-icon-${s}`}>
            {s === 'yes' ? '✓' : s === 'no' ? '✗' : '○'}
          </span>
        ))}
      </div>
    </div>
  )
}

export function LeaderboardRow({ entry, rank, rankDelta, activeVote, sessionId: _sessionId, cutoffScore, revealed, isInitialEntry, revealDelay, onRemove, coverUrl, coverLoading, onOpenCover }: Props) {
  const classColor = entry.className ? CLASS_COLORS[entry.className] ?? '#aaa' : '#aaa'
  const scoreColor = entry.status === 'success' && cutoffScore > 0
    ? scoreToColor(entry.score ?? 0, 0, cutoffScore)
    : '#9d9d9d'

  const anim = revealed && isInitialEntry
    ? { className: revealClass(rank), style: { animationDelay: `${revealDelay}s` } }
    : { className: '', style: {} }

  if (entry.status === 'loading') {
    return (
      <div className={`row row-loading ${anim.className}`} style={{ ...anim.style, '--spec-color': classColor } as unknown as React.CSSProperties}>
        <div className="row-main">
          <RankBadge rank={rank} delta={rankDelta} />
          <div className="row-avatar skeleton" />
          <div className="row-info">
            <span className="row-name">{entry.name}</span>
            <span className="row-sub">Loading...</span>
          </div>
          <div className="row-score-wrap">
            <span className="row-score">...</span>
            <span className="row-score-label">Tank IO</span>
          </div>
          <button className="remove-btn" onClick={() => onRemove(entry.id)}>✕</button>
        </div>
      </div>
    )
  }

  if (entry.status === 'error') {
    return (
      <div className={`row row-error ${anim.className}`} style={{ ...anim.style, '--spec-color': classColor } as unknown as React.CSSProperties}>
        <div className="row-main">
          <RankBadge rank={rank} delta={rankDelta} />
          <div className="row-avatar row-avatar-err">?</div>
          <div className="row-info">
            <span className="row-name">{entry.name}</span>
            <span className="row-sub row-error-msg">{entry.error ?? 'Failed to load'}</span>
          </div>
          <div className="row-score-wrap">
            <span className="row-score row-score-err">—</span>
            <span className="row-score-label">Tank IO</span>
          </div>
          <button className="remove-btn" onClick={() => onRemove(entry.id)}>✕</button>
        </div>
      </div>
    )
  }

  const isFirst = rank === 1 && entry.status === 'success'
  const hasCover = isFirst && (!!coverLoading || !!coverUrl)

  return (
    <a
      className={`row${isFirst ? ' row-first' : ''} ${anim.className}`}
      style={{ ...anim.style, '--spec-color': classColor } as unknown as React.CSSProperties}
      href={entry.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {isFirst && <span className="crown" aria-hidden>♛</span>}
      {hasCover && (
        <div
          className="row-cover-hero"
          onClick={(e) => { e.preventDefault(); if (coverUrl) onOpenCover?.() }}
          title={coverUrl ? 'View full album cover' : 'Generating cover art…'}
        >
          {coverLoading && !coverUrl
            ? <div className="row-cover-shimmer" />
            : <img src={coverUrl!} className="row-cover-img" alt="Generated album cover" />
          }
        </div>
      )}
      <div className="row-main">
        <RankBadge rank={rank} delta={rankDelta} />
        {entry.thumbnailUrl ? (
          <img className={`row-avatar${isFirst ? ' row-avatar-first' : ''}`} src={entry.thumbnailUrl} alt={entry.name} />
        ) : (
          <div className={`row-avatar row-avatar-placeholder${isFirst ? ' row-avatar-first' : ''}`} />
        )}
        <div className="row-info">
          <span className="row-name" style={{ color: classColor }}>{entry.name}</span>
          <span className="row-sub">
            {entry.className ? (CLASS_TANK_SPEC[entry.className] ?? entry.specName) : entry.specName} {entry.className}
          </span>
        </div>
        {entry.history && (
          <Sparkline history={entry.history} color={classColor} id={entry.id} />
        )}
        <div className="row-score-wrap">
          <span className={`row-score${isFirst ? ' row-score-first' : ''}`} style={{ color: scoreColor }}>
            {entry.score?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '0'}
          </span>
          <span className="row-score-label">
            {entry.scoreDelta != null && entry.scoreDelta > 0
              ? <span className="score-delta">+{entry.scoreDelta.toLocaleString(undefined, { maximumFractionDigits: 1 })} today</span>
              : 'Tank IO'}
          </span>
        </div>
        <button
          className={`remove-btn${activeVote?.failed ? ' remove-btn-locked' : ''}`}
          disabled={!!activeVote?.failed}
          onClick={(e) => { e.preventDefault(); if (!activeVote?.failed) onRemove(entry.id) }}
          title={activeVote?.failed ? 'Vote to remove failed — on cooldown' : undefined}
        >
          {activeVote?.failed ? '🔒' : '✕'}
        </button>
      </div>
      {activeVote && !activeVote.failed && <VoteStrip vote={activeVote} />}
      {activeVote?.failed && <FailedStrip vote={activeVote} />}
    </a>
  )
}
