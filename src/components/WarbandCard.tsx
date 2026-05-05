import { useState } from 'react'
import { insetAvatarUrl } from '../api'
import { scoreToColor } from '../scoreColor'
import { scoreToRankFromCutoffs, getNextRankInfoFromCutoffs } from '../solo-queue'
import type { RankCutoff } from '../solo-queue'
import type { WarbandEntry, WarbandRun } from '../types'
import { WarbandModal } from './WarbandModal'
import { KeyDetailModal } from './KeyDetailModal'

// Original WoW class colors — used for warband name gradient
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


function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
}

function colorAtPos(pos: number, stops: { pct: number; color: string }[]): string {
  for (let i = 0; i < stops.length - 1; i++) {
    if (pos <= stops[i + 1].pct) {
      const range = stops[i + 1].pct - stops[i].pct
      const t = range === 0 ? 0 : (pos - stops[i].pct) / range
      return lerpColor(stops[i].color, stops[i + 1].color, t)
    }
  }
  return stops[stops.length - 1].color
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

  const classCounts = new Map<string, number>()
  for (const run of entry.topRuns) {
    if (run.characterClass) {
      classCounts.set(run.characterClass, (classCounts.get(run.characterClass) ?? 0) + 1)
    }
  }
  const sortedClasses = [...classCounts.entries()].sort((a, b) => b[1] - a[1])
  const total = sortedClasses.reduce((sum, [, n]) => sum + n, 0)

  const gradientStops: { pct: number; color: string }[] = []
  if (total > 0) {
    let cursor = 0
    for (const [cls, count] of sortedClasses) {
      gradientStops.push({ pct: cursor, color: CLASS_COLORS[cls] ?? '#aaa' })
      cursor += count / total
    }
    gradientStops.push({ pct: 1, color: gradientStops[gradientStops.length - 1].color })
  }

  let nameContent: React.ReactNode = entry.name
  if (sortedClasses.length === 1) {
    nameContent = <span style={{ color: CLASS_COLORS[sortedClasses[0][0]] ?? '#aaa' }}>{entry.name}</span>
  } else if (sortedClasses.length > 1) {
    nameContent = entry.name.split('').map((char, i) => {
      const pos = entry.name.length <= 1 ? 0 : i / (entry.name.length - 1)
      return <span key={i} style={{ color: colorAtPos(pos, gradientStops) }}>{char}</span>
    })
  }

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
              {nameContent}
            </span>
            <span className="row-sub" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>{entry.members.length} member{entry.members.length !== 1 ? 's' : ''} · Warband</span>
              {entry.topRuns.length > 0 && (() => {
                const roles = Array.from(new Set(entry.topRuns.map(r => r.role)));
                const order: Array<'tank' | 'healer' | 'dps'> = ['tank', 'healer', 'dps'];
                return (
                  <span style={{ display: 'flex', gap: '0.2rem' }}>
                    {order.filter(r => roles.includes(r)).map(role => (
                      <span key={role} className={`role-badge role-badge-${role}`}>{role}</span>
                    ))}
                  </span>
                )
              })()}
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
