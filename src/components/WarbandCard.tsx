import { useState } from 'react'
import { insetAvatarUrl } from '../api'
import { scoreToColor } from '../scoreColor'
import { scoreToRankFromCutoffs, getNextRankInfoFromCutoffs } from '../solo-queue'
import type { RankCutoff } from '../solo-queue'
import type { WarbandEntry, WarbandRun } from '../types'
import { WarbandModal } from './WarbandModal'
import { KeyDetailModal } from './KeyDetailModal'

// Brightened class colors for small chip text — dark originals (DK, DH, Evoker, Shaman) are unreadable at small sizes
const CLASS_COLORS: Record<string, string> = {
  'Death Knight': '#FF4D6A',
  'Demon Hunter': '#CF65E8',
  Druid: '#FF7C0A',
  Evoker: '#52BFA8',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Monk: '#00FF98',
  Paladin: '#F48CBA',
  Priest: '#C8C8C8',
  Rogue: '#FFF468',
  Shaman: '#3399FF',
  Warlock: '#A9AAFF',
  Warrior: '#D4A843',
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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="rank rank-gold">1</span>
  if (rank === 2) return <span className="rank rank-silver">2</span>
  if (rank === 3) return <span className="rank rank-bronze">3</span>
  return <span className="rank">{rank}</span>
}

interface Props {
  entry: WarbandEntry
  rank: number
  sessionId: string
  cutoffScore: number
  soloMapping?: RankCutoff[]
  revealed: boolean
  isInitialEntry: boolean
  revealDelay: number
  onRemoveMember: (warbandId: string, memberKey: string) => void
  onRemoveWarband: (warbandId: string) => void
  dungeonOrder?: string[]
}

export function WarbandCard({
  entry, rank, sessionId, cutoffScore, soloMapping, revealed, isInitialEntry, revealDelay,
  onRemoveMember, onRemoveWarband, dungeonOrder,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedRun, setSelectedRun] = useState<WarbandRun | null>(null)

  const isOwner = entry.ownerSessionId === sessionId
  const isFirst = rank === 1
  const revealClass = rank === 1 ? 'row-reveal-1' : rank === 2 ? 'row-reveal-2' : rank === 3 ? 'row-reveal-3' : 'row-reveal-rest'
  const anim = revealed && isInitialEntry
    ? { className: revealClass, style: { animationDelay: `${revealDelay}s` } }
    : { className: '', style: {} }

  const rankColor = soloMapping && soloMapping.length > 0 && entry.score > 0
    ? TIER_COLORS[scoreToRankFromCutoffs(entry.score, soloMapping).tier]
    : undefined
  const nextInfo = soloMapping && soloMapping.length > 0 && entry.score > 0
    ? getNextRankInfoFromCutoffs(entry.score, soloMapping)
    : null
  const scoreColor = entry.score > 0 && cutoffScore > 0
    ? scoreToColor(entry.score, 0, cutoffScore)
    : '#9d9d9d'

  const topRunClasses = [...new Set(
    entry.topRuns.map(r => r.characterClass).filter((c): c is string => !!c)
  )]
  const gradientColors = topRunClasses.map(c => CLASS_COLORS[c] ?? '#aaa')
  const nameStyle: React.CSSProperties | undefined = gradientColors.length > 1
    ? {
        background: `linear-gradient(90deg, ${gradientColors.join(', ')})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }
    : gradientColors.length === 1
    ? { color: gradientColors[0] }
    : undefined

  // Best run per dungeon across the warband (for key chips)
  const bestByDungeon = new Map<string, WarbandRun>()
  for (const run of entry.topRuns) {
    const existing = bestByDungeon.get(run.shortName)
    if (!existing || run.score > existing.score) bestByDungeon.set(run.shortName, run)
  }

  return (
    <>
      <div
        className={`row row-clickable warband-row${isFirst ? ' row-first' : ''} ${anim.className}`}
        style={{ ...anim.style, ...(rankColor ? { '--rank-color': rankColor } : {}) } as React.CSSProperties}
        onClick={() => setModalOpen(true)}
        role="button"
      >
        {isFirst && <span className="crown" aria-hidden>♛</span>}
        <div className="row-main">
          <RankBadge rank={rank} />

          <div className="warband-avatars">
            {entry.contributors.slice(0, 4).map(c => (
              c.thumbnailUrl ? (
                <img
                  key={`${c.name}-${c.realm}`}
                  className="warband-avatar"
                  src={insetAvatarUrl(c.thumbnailUrl)}
                  onError={e => { (e.currentTarget as HTMLImageElement).src = c.thumbnailUrl! }}
                  alt={c.name}
                  title={c.name}
                />
              ) : (
                <div
                  key={`${c.name}-${c.realm}`}
                  className="warband-avatar warband-avatar-placeholder"
                  title={c.name}
                />
              )
            ))}
            {entry.contributors.length > 4 && (
              <div className="warband-avatar warband-avatar-overflow">
                +{entry.contributors.length - 4}
              </div>
            )}
          </div>

          <div className="row-info">
            <span className="row-name">
              <span className="warband-icon" aria-hidden>⚔ </span>
              <span style={nameStyle}>{entry.name}</span>
            </span>
            <span className="row-sub">
              {entry.members.length} member{entry.members.length !== 1 ? 's' : ''} · Warband
            </span>
          </div>

          <div className="row-score-area">
            {rankColor && (
              <div className="row-rank-col">
                <span
                  className="row-rank-badge"
                  style={{ color: rankColor, borderColor: rankColor, background: `color-mix(in srgb, ${rankColor} 12%, transparent)` }}
                >
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
                {entry.score.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="row-score-label">Warband IO</span>
            </div>
          </div>

          <button
            className={`remove-btn${isOwner ? '' : ' remove-btn-hidden'}`}
            aria-hidden={!isOwner}
            disabled={!isOwner}
            onClick={e => { e.stopPropagation(); onRemoveWarband(entry.id) }}
            title="Delete warband"
          >✕</button>
        </div>

        {dungeonOrder && dungeonOrder.length > 0 && (
          <div className="best-keys-strip" onClick={e => e.stopPropagation()}>
            {dungeonOrder.map(shortName => {
              const run = bestByDungeon.get(shortName)
              return (
                <div
                  key={shortName}
                  className={`key-chip${run ? ` key-chip-${run.role} key-chip-clickable` : ' key-chip-empty'}`}
                  title={run ? `${run.dungeon} +${run.level} — ${run.characterName}` : shortName}
                  onClick={run ? () => setSelectedRun(run) : undefined}
                  role={run ? 'button' : undefined}
                >
                  <span className="key-chip-name">{shortName}</span>
                  {run && <span className="key-chip-level">+{run.level}</span>}
                  {run && <span className="key-chip-char" style={{ color: run.characterClass ? CLASS_COLORS[run.characterClass] ?? '#aaa' : undefined }}>{run.characterName}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <WarbandModal
          entry={entry}
          sessionId={sessionId}
          onRemoveMember={onRemoveMember}
          onClose={() => setModalOpen(false)}
        />
      )}
      {selectedRun && (
        <KeyDetailModal
          run={selectedRun}
          characterName={selectedRun.characterName}
          characterClass={selectedRun.characterClass}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </>
  )
}
