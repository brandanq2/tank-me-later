import type { VoteRecord } from '../types'
import { insetAvatarUrl } from '../api'

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

function formatTimeRemaining(expiresAt: number): string {
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m remaining`
  return `${m}m remaining`
}

interface Props {
  votes: VoteRecord[]
  sessionId: string
  onVote: (charKey: string, vote: 'yes' | 'no') => void
  onClose: () => void
}

export function VoteModal({ votes, sessionId, onVote, onClose }: Props) {
  if (votes.length === 0) return null

  return (
    <div className="vote-overlay">
      <div className="vote-modal">
        <div className="vote-modal-header">
          <span>⚔ Vote to Remove</span>
          <button className="vote-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {votes.map((vote) => {
          const hasVotedYes = vote.yesVotes.includes(sessionId)
          const hasVotedNo = vote.noVotes.includes(sessionId)
          const hasVoted = hasVotedYes || hasVotedNo
          const classColor = vote.className ? CLASS_COLORS[vote.className] ?? '#aaa' : '#aaa'
          const yesCount = vote.yesVotes.length
          const progressPct = Math.min((yesCount / 3) * 100, 100)

          return (
            <div key={vote.charKey} className="vote-card">
              <div className="vote-char-info">
                {vote.thumbnailUrl ? (
                  <img
                    className="vote-avatar"
                    src={insetAvatarUrl(vote.thumbnailUrl)}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = vote.thumbnailUrl }}
                    alt={vote.name}
                  />
                ) : (
                  <div className="vote-avatar-placeholder" />
                )}
                <div>
                  <div className="vote-char-name" style={{ color: classColor }}>
                    {vote.name}
                  </div>
                  <div className="vote-char-sub">
                    {vote.specName ? `${vote.specName} ` : ''}{vote.className ? `${vote.className} — ` : ''}{vote.realm} ({vote.region.toUpperCase()})
                  </div>
                </div>
              </div>

              <div className="vote-tally">
                <div className="vote-tally-text">
                  <span>
                    <span className="vote-tally-count">{yesCount} / 3</span> votes to remove
                  </span>
                  <span className="vote-time">{formatTimeRemaining(vote.expiresAt)}</span>
                </div>
                <div className="vote-progress-track">
                  <div className="vote-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              {hasVoted ? (
                <div className={`vote-cast-status ${hasVotedYes ? 'vote-cast-yes' : 'vote-cast-no'}`}>
                  {hasVotedYes ? 'You voted YES' : 'You voted NO'}
                </div>
              ) : (
                <div className="vote-buttons">
                  <button className="vote-btn-yes" onClick={() => onVote(vote.charKey, 'yes')}>
                    YES — Remove
                  </button>
                  <button className="vote-btn-no" onClick={() => onVote(vote.charKey, 'no')}>
                    NO — Keep
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
