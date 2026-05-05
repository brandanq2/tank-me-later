import { useEffect } from 'react'
import type { BestRun } from '../types'

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

const ROLE_COLORS: Record<string, string> = {
  tank: '#4fc3f7',
  healer: '#2ecc71',
  dps: '#e74c3c',
}

function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function timeDelta(clearMs: number, parMs: number): string {
  const diff = Math.abs(clearMs - parMs)
  const sign = clearMs <= parMs ? '-' : '+'
  return `${sign}${formatMs(diff)}`
}

function upgradeLabel(n: number): { text: string; color: string } {
  if (n === 0) return { text: 'Depleted', color: '#e74c3c' }
  if (n === 1) return { text: '+1 Upgrade', color: '#f39c12' }
  if (n === 2) return { text: '+2 Upgrades', color: '#2ecc71' }
  return { text: '+3 Upgrades', color: '#4fc3f7' }
}

interface Props {
  run: BestRun
  characterName: string
  onClose: () => void
}

export function KeyDetailModal({ run, characterName, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const upgrade = upgradeLabel(run.numUpgrades)
  const timed = run.clearTimeMs <= run.parTimeMs
  const delta = run.clearTimeMs > 0 && run.parTimeMs > 0 ? timeDelta(run.clearTimeMs, run.parTimeMs) : null
  const completedDate = run.completedAt
    ? new Date(run.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const roleColor = ROLE_COLORS[run.role]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal key-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="key-modal-header">
          <div className="key-modal-dungeon">
            <span className="key-modal-name">{run.dungeon}</span>
            <span className="key-modal-level" style={{ color: roleColor }}>+{run.level}</span>
          </div>
          <div className="key-modal-meta">
            <span className="key-modal-upgrade" style={{ color: upgrade.color }}>{upgrade.text}</span>
            {completedDate && <span className="key-modal-date">{completedDate}</span>}
          </div>
        </div>

        <div className="key-modal-timer">
          <div className="key-modal-timer-row">
            <span className="key-modal-timer-label">Clear Time</span>
            <span className="key-modal-timer-value">
              {run.clearTimeMs > 0 ? formatMs(run.clearTimeMs) : '—'}
            </span>
          </div>
          <div className="key-modal-timer-row">
            <span className="key-modal-timer-label">Par Time</span>
            <span className="key-modal-timer-value">
              {run.parTimeMs > 0 ? formatMs(run.parTimeMs) : '—'}
            </span>
          </div>
          {delta && (
            <div className="key-modal-timer-row">
              <span className="key-modal-timer-label">Δ Timer</span>
              <span className="key-modal-timer-value" style={{ color: timed ? '#2ecc71' : '#e74c3c' }}>
                {delta}
              </span>
            </div>
          )}
          {run.score > 0 && (
            <div className="key-modal-timer-row">
              <span className="key-modal-timer-label">Score</span>
              <span className="key-modal-timer-value">
                {run.score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
            </div>
          )}
        </div>

        <div className="key-modal-roster">
          <div className="key-modal-section-label">Party</div>
          {run.roster.length > 0 ? run.roster.map((member, i) => {
            const isSubject = member.name.toLowerCase() === characterName.toLowerCase()
            const classColor = CLASS_COLORS[member.className] ?? '#aaa'
            const memberRoleColor = ROLE_COLORS[member.role] ?? '#aaa'
            return (
              <div key={i} className={`key-modal-member${isSubject ? ' key-modal-member-self' : ''}`}>
                <span className="key-modal-member-role" style={{ color: memberRoleColor }}>
                  {member.role === 'tank' ? '⛉' : member.role === 'healer' ? '✚' : '⚔'}
                </span>
                <span className="key-modal-member-name" style={{ color: classColor }}>
                  {member.name}
                </span>
                <span className="key-modal-member-spec">{member.specName} {member.className}</span>
              </div>
            )
          }) : (
            <span className="key-modal-roster-empty">Party details available on Raider.io</span>
          )}
        </div>

        {run.url && (
          <a
            href={run.url}
            target="_blank"
            rel="noopener noreferrer"
            className="key-modal-link"
          >
            View on Raider.io ↗
          </a>
        )}
      </div>
    </div>
  )
}
