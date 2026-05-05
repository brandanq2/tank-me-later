import { useState } from 'react'
import { insetAvatarUrl } from '../api'
import type { WarbandEntry, WarbandRun } from '../types'
import { WarbandModal } from './WarbandModal'
import { KeyDetailModal } from './KeyDetailModal'

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
  revealed: boolean
  isInitialEntry: boolean
  revealDelay: number
  onRemoveMember: (warbandId: string, memberKey: string) => void
  onRemoveWarband: (warbandId: string) => void
  dungeonOrder?: string[]
}

export function WarbandCard({
  entry, rank, sessionId, revealed, isInitialEntry, revealDelay,
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
        style={anim.style}
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
              {entry.name}
            </span>
            <span className="row-sub">
              {entry.members.length} member{entry.members.length !== 1 ? 's' : ''} · Warband
            </span>
          </div>

          <div className="row-score-wrap">
            <span className={`row-score${isFirst ? ' row-score-first' : ''}`}>
              {entry.score.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="row-score-label">Warband IO</span>
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
                  {run && <span className="key-chip-char">{run.characterName}</span>}
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
