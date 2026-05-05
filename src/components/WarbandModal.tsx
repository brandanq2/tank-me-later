import { insetAvatarUrl } from '../api'
import type { WarbandEntry } from '../types'

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

interface Props {
  entry: WarbandEntry
  sessionId: string
  onRemoveMember: (warbandId: string, memberKey: string) => void
  onClose: () => void
}

export function WarbandModal({ entry, sessionId, onRemoveMember, onClose }: Props) {
  const isOwner = entry.ownerSessionId === sessionId

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-panel wm-panel" onClick={e => e.stopPropagation()}>
        <button className="cm-close" onClick={onClose}>✕</button>

        <div className="wm-header">
          <div className="wm-title-row">
            <span className="warband-icon wm-icon" aria-hidden>⚔</span>
            <span className="cm-name">{entry.name}</span>
          </div>
          <div className="cm-score-block">
            <span className="cm-score">
              {entry.score.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="cm-score-label">Warband IO</span>
          </div>
        </div>

        <div className="cm-section">
          <p className="cm-section-label">Members · {entry.members.length}</p>
          <div className="wm-member-list">
            {entry.members.map(member => {
              const key = `${member.name}-${member.realm}-${member.region}`.toLowerCase()
              const classColor = member.className ? CLASS_COLORS[member.className] ?? '#aaa' : '#aaa'
              const subText = member.status === 'loading'
                ? 'Loading…'
                : member.status === 'error'
                ? 'Failed to load'
                : `${member.realm} · ${member.region.toUpperCase()} · ${(member.score ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} IO`

              return (
                <div key={key} className="wm-member">
                  {member.thumbnailUrl ? (
                    <img
                      className="wm-member-avatar"
                      src={insetAvatarUrl(member.thumbnailUrl)}
                      onError={e => { (e.currentTarget as HTMLImageElement).src = member.thumbnailUrl! }}
                      alt={member.name}
                    />
                  ) : (
                    <div className="wm-member-avatar wm-member-avatar-placeholder" />
                  )}
                  <div className="wm-member-info">
                    <span className="wm-member-name" style={{ color: classColor }}>
                      {member.name}
                    </span>
                    <span className="wm-member-sub">{subText}</span>
                  </div>
                  {isOwner && (
                    <button
                      className="remove-btn"
                      onClick={() => onRemoveMember(entry.id, key)}
                      title="Remove from warband"
                    >✕</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {entry.topRuns.length > 0 && (
          <div className="cm-section">
            <p className="cm-section-label">Top 8 Keys</p>
            <div className="wm-top-runs">
              {entry.topRuns.map((run, i) => (
                <div key={i} className="wm-run-row">
                  <span className={`key-chip key-chip-${run.role}`}>
                    <span className="key-chip-name">{run.shortName}</span>
                    <span className="key-chip-level">+{run.level}</span>
                  </span>
                  <span className="wm-run-char" style={{ color: run.characterClass ? CLASS_COLORS[run.characterClass] ?? '#aaa' : '#aaa' }}>{run.characterName}</span>
                  <span className="wm-run-score">
                    {run.score.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
