import { useState } from 'react'
import { scoreToColor } from '../scoreColor'
import { insetAvatarUrl } from '../api'
import { scoreToRankFromCutoffs, getNextRankInfoFromCutoffs } from '../solo-queue'
import type { RankCutoff } from '../solo-queue'
import type { BestRun, CharacterEntry, VoteRecord } from '../types'
import { CharacterModal } from './CharacterModal'
import { KeyDetailModal } from './KeyDetailModal'

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
  scoreLabel?: string
  soloMapping?: RankCutoff[]
  votingEnabled?: boolean
  showClassLabel?: boolean
  dungeonOrder?: string[]
}

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

function revealClass(rank: number): string {
  if (rank === 1) return 'row-reveal-1'
  if (rank === 2) return 'row-reveal-2'
  if (rank === 3) return 'row-reveal-3'
  return 'row-reveal-rest'
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
    <div className="vote-strip" onClick={e => e.preventDefault()}>
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

export function LeaderboardRow({ entry, rank, rankDelta, activeVote, sessionId: _sessionId, cutoffScore, revealed, isInitialEntry, revealDelay, onRemove, scoreLabel = 'Tank IO', soloMapping, votingEnabled, showClassLabel, dungeonOrder }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedRun, setSelectedRun] = useState<BestRun | null>(null)
  const classColor = entry.className ? CLASS_COLORS[entry.className] ?? '#aaa' : '#aaa'
  const scoreColor = entry.status === 'success' && cutoffScore > 0
    ? scoreToColor(entry.score ?? 0, 0, cutoffScore)
    : '#9d9d9d'

  const rankColor = soloMapping && soloMapping.length > 0 && entry.score != null
    ? TIER_COLORS[scoreToRankFromCutoffs(entry.score, soloMapping).tier]
    : undefined

  const nextInfo = soloMapping && soloMapping.length > 0 && entry.score != null
    ? getNextRankInfoFromCutoffs(entry.score, soloMapping)
    : null

  const anim = revealed && isInitialEntry
    ? { className: revealClass(rank), style: { animationDelay: `${revealDelay}s` } }
    : { className: '', style: {} }

  if (entry.status === 'loading') {
    return (
      <div className={`row row-loading ${anim.className}`} style={anim.style}>
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
          <button
            className={`remove-btn${!(votingEnabled || entry.isOwned) ? ' remove-btn-hidden' : ''}`}
            disabled={!(votingEnabled || entry.isOwned)}
            onClick={() => { if (votingEnabled || entry.isOwned) onRemove(entry.id) }}
            aria-hidden={!(votingEnabled || entry.isOwned)}
          >✕</button>
        </div>
      </div>
    )
  }

  if (entry.status === 'error') {
    return (
      <div className={`row row-error ${anim.className}`} style={anim.style}>
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
          <button
            className={`remove-btn${!(votingEnabled || entry.isOwned) ? ' remove-btn-hidden' : ''}`}
            disabled={!(votingEnabled || entry.isOwned)}
            onClick={() => { if (votingEnabled || entry.isOwned) onRemove(entry.id) }}
            aria-hidden={!(votingEnabled || entry.isOwned)}
          >✕</button>
        </div>
      </div>
    )
  }

  const isFirst = rank === 1 && entry.status === 'success'

  return (
    <>
      <div
        className={`row row-clickable${isFirst ? ' row-first' : ''} ${anim.className}`}
        style={{ ...anim.style, ...(rankColor ? { '--rank-color': rankColor } : {}) } as unknown as React.CSSProperties}
        onClick={() => setModalOpen(true)}
        role="button"
      >
        {isFirst && <span className="crown" aria-hidden>♛</span>}
        <div className="row-main">
          <RankBadge rank={rank} delta={rankDelta} />
          {entry.thumbnailUrl ? (
            <img
              className={`row-avatar${isFirst ? ' row-avatar-first' : ''}`}
              src={insetAvatarUrl(entry.thumbnailUrl)}
              onError={e => { (e.currentTarget as HTMLImageElement).src = entry.thumbnailUrl! }}
              alt={entry.name}
            />
          ) : (
            <div className={`row-avatar row-avatar-placeholder${isFirst ? ' row-avatar-first' : ''}`} />
          )}
          <div className="row-info">
            <span className="row-name" style={{ color: classColor }}>{entry.name}</span>
            {showClassLabel ? (
              <span className="row-sub" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>{entry.className}</span>
                {entry.bestRuns && entry.bestRuns.length > 0 && (() => {
                  const roles = Array.from(new Set(entry.bestRuns!.map(r => r.role)))
                  const order: Array<'tank' | 'healer' | 'dps'> = ['tank', 'healer', 'dps']
                  return (
                    <span style={{ display: 'flex', gap: '0.2rem' }}>
                      {order.filter(r => roles.includes(r)).map(role => (
                        <span key={role} className={`role-badge role-badge-${role}`}>{role}</span>
                      ))}
                    </span>
                  )
                })()}
              </span>
            ) : (
              <span className="row-sub">
                {entry.className ? (CLASS_TANK_SPEC[entry.className] ?? entry.specName) : entry.specName} {entry.className}
              </span>
            )}
          </div>
          <div className="row-score-area">
            {rankColor && entry.score != null && (
              <div className="row-rank-col">
                <span className="row-rank-badge" style={{ color: rankColor, borderColor: rankColor, background: `color-mix(in srgb, ${rankColor} 12%, transparent)` }}>
                  {scoreToRankFromCutoffs(entry.score, soloMapping!).label}
                </span>
                {nextInfo && (
                  <span className="row-next-rank" style={{ color: rankColor }}>
                    ↑ {nextInfo.pointsNeeded.toLocaleString()} to {nextInfo.nextRank.label}
                  </span>
                )}
              </div>
            )}
            <div className="row-score-wrap">
              <span className={`row-score${isFirst ? ' row-score-first' : ''}`} style={{ color: scoreColor }}>
                {entry.score?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '0'}
              </span>
              <span className="row-score-label">
                {entry.scoreDelta != null && entry.scoreDelta > 0
                  ? <span className="score-delta">+{entry.scoreDelta.toLocaleString(undefined, { maximumFractionDigits: 1 })} today</span>
                  : scoreLabel}
              </span>
            </div>
          </div>
          <button
            className={`remove-btn${activeVote?.failed ? ' remove-btn-locked' : ''}${!(votingEnabled || entry.isOwned) ? ' remove-btn-hidden' : ''}`}
            disabled={!!activeVote?.failed || !(votingEnabled || entry.isOwned)}
            onClick={e => { e.stopPropagation(); if (!activeVote?.failed && (votingEnabled || entry.isOwned)) onRemove(entry.id) }}
            title={activeVote?.failed ? 'Vote to remove failed — on cooldown' : undefined}
            aria-hidden={!(votingEnabled || entry.isOwned)}
          >
            {activeVote?.failed ? '🔒' : '✕'}
          </button>
        </div>
        {votingEnabled && activeVote && !activeVote.failed && <VoteStrip vote={activeVote} />}
        {votingEnabled && activeVote?.failed && <FailedStrip vote={activeVote} />}
        {dungeonOrder && dungeonOrder.length > 0 && (
          <div className="best-keys-strip" onClick={e => e.stopPropagation()}>
            {dungeonOrder.map(shortName => {
              const run = entry.bestRuns?.find(r => r.shortName === shortName)
              return (
                <div
                  key={shortName}
                  className={`key-chip${run ? ` key-chip-${run.role} key-chip-clickable` : ' key-chip-empty'}`}
                  title={run ? `${run.dungeon} +${run.level} (${run.role})` : shortName}
                  onClick={run ? () => setSelectedRun(run) : undefined}
                  role={run ? 'button' : undefined}
                >
                  <span className="key-chip-name">{shortName}</span>
                  {run && <span className="key-chip-level">+{run.level}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <CharacterModal
          entry={entry}
          leaderRank={rank}
          classColor={classColor}
          soloMapping={soloMapping}
          onClose={() => setModalOpen(false)}
        />
      )}
      {selectedRun && (
        <KeyDetailModal
          run={selectedRun}
          characterName={entry.name}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </>
  )
}
