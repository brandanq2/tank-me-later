import { useEffect, useState, type FormEvent } from 'react'
import { insetAvatarUrl, fetchWarbandHistory } from '../api'
import { charKey } from '../hooks/useWarbands'
import type { CharacterInput, HistoryPoint, WarbandEntry, WarbandRun } from '@tml/shared/types'
import { HistoryChart } from './HistoryChart'
import { KeyTimeline } from './KeyTimeline'

const REGIONS = ['us', 'eu', 'kr', 'tw', 'cn']

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
  chartColor?: string
  onRemoveMember: (warbandId: string, memberKey: string) => void
  onAddMember?: (warbandId: string, member: CharacterInput) => void
  onClaim?: (warbandId: string, code: string) => Promise<string | null>
  onClose: () => void
}

export function WarbandModal({ entry, chartColor, onRemoveMember, onAddMember, onClaim, onClose }: Props) {
  const isOwner = entry.isOwner
  const [charName, setCharName] = useState('')
  const [charRealm, setCharRealm] = useState('')
  const [charRegion, setCharRegion] = useState('us')
  const [history, setHistory] = useState<HistoryPoint[] | null>(null)
  const [claimCode, setClaimCode] = useState('')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchWarbandHistory(entry.id)
      .then(h => { if (!cancelled) setHistory(h) })
      .catch(() => { if (!cancelled) setHistory([]) })
    return () => { cancelled = true }
  }, [entry.id])

  const allMemberRuns: WarbandRun[] = entry.members.flatMap(m =>
    m.status === 'success' && m.bestRuns
      ? m.bestRuns.map(r => ({
          ...r,
          characterName: m.name,
          characterClass: m.className,
          thumbnailUrl: m.thumbnailUrl,
        }))
      : []
  )

  function handleAddMember(e: FormEvent) {
    e.preventDefault()
    const n = charName.trim(), r = charRealm.trim()
    if (!n || !r || !onAddMember) return
    const newKey = `${n}-${r}-${charRegion}`.toLowerCase()
    if (entry.members.some(m => `${m.name}-${m.realm}-${m.region}`.toLowerCase() === newKey)) return
    onAddMember(entry.id, { name: n, realm: r, region: charRegion })
    setCharName('')
    setCharRealm('')
  }

  async function handleClaim(e: FormEvent) {
    e.preventDefault()
    if (!onClaim || !claimCode.trim() || claiming) return
    setClaiming(true)
    setClaimError(null)
    try {
      setClaimError(await onClaim(entry.id, claimCode.trim()))
    } finally {
      setClaiming(false)
    }
  }

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
              {entry.score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
            <span className="cm-score-label">Warband IO</span>
          </div>
        </div>

        <div className="cm-section">
          <p className="cm-section-label">Members · {entry.members.length}</p>
          {isOwner && onAddMember && (
            <form className="add-form wm-add-form" onSubmit={handleAddMember}>
              <input
                type="text"
                placeholder="Character name"
                value={charName}
                onChange={e => setCharName(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Realm"
                value={charRealm}
                onChange={e => setCharRealm(e.target.value)}
                required
              />
              <select value={charRegion} onChange={e => setCharRegion(e.target.value)}>
                {REGIONS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
              </select>
              <button type="submit" disabled={!charName.trim() || !charRealm.trim()}>Add</button>
            </form>
          )}
          <div className="wm-member-list">
            {entry.members.map(member => {
              const key = charKey(member)
              const classColor = member.className ? CLASS_COLORS[member.className] ?? '#aaa' : '#aaa'
              const subText = member.status === 'loading'
                ? 'Loading…'
                : member.status === 'error'
                ? 'Failed to load'
                : `${member.realm} · ${member.region.toUpperCase()} · ${(member.score ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} IO`

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

        {isOwner && entry.claimCode && (
          <div className="cm-section">
            <p className="cm-section-label">Access Code</p>
            <div className="wm-claim-code-row">
              <code className="wm-claim-code">{entry.claimCode}</code>
              <button
                className="wm-claim-copy"
                onClick={() => { navigator.clipboard?.writeText(entry.claimCode!) }}
              >Copy</button>
            </div>
            <p className="wm-claim-hint">
              Save this. Entering it on another browser or PC gives that device
              ownership too — you keep access everywhere you've claimed.
            </p>
          </div>
        )}

        {!isOwner && onClaim && (
          <div className="cm-section">
            <p className="cm-section-label">Claim This Warband</p>
            <form className="wm-claim-form" onSubmit={handleClaim}>
              <input
                type="text"
                placeholder="Access code (e.g. K7QP-3MXR)"
                value={claimCode}
                onChange={e => { setClaimCode(e.target.value); setClaimError(null) }}
                autoComplete="off"
                required
              />
              <button type="submit" disabled={!claimCode.trim() || claiming}>
                {claiming ? 'Claiming…' : 'Claim'}
              </button>
            </form>
            {claimError && <p className="wm-claim-error">{claimError}</p>}
            <p className="wm-claim-hint">
              Made this warband on a different PC? Enter its access code to
              manage it from here.
            </p>
          </div>
        )}

        {history && history.some(h => h.score !== null) && (
          <div className="cm-section">
            <p className="cm-section-label">Score History</p>
            <HistoryChart
              history={history}
              currentScore={entry.score}
              color={chartColor ?? '#9B7DC0'}
              idSuffix={`wm-${entry.id}`}
            />
          </div>
        )}

        {allMemberRuns.length > 0 && (
          <div className="cm-section">
            <p className="cm-section-label">Key Timings · Past Week</p>
            <KeyTimeline
              runs={allMemberRuns}
              history={history ?? undefined}
              currentScore={entry.score}
            />
          </div>
        )}
      </div>
    </div>
  )
}
