import { useState, type FormEvent } from 'react'
import { classColor } from '@tml/shared/titleStatus'
import type { CharacterInput, WarbandDefinition, WarbandEntry } from '@tml/shared/types'
import { SpecIcon } from './SpecIcon'
import type { CharacterLook } from '../../midnight/useCharacterLooks'
import { charKey } from '../../hooks/useWarbands'

interface Props {
  /** Warbands this browser session owns — usually exactly one. */
  owned: WarbandEntry[]
  /** Warbands owned by someone else, offered for access-code recovery. */
  others: WarbandEntry[]
  /** raider.io class/spec data, keyed by charKey. */
  looks: Record<string, CharacterLook>
  onCreate: (name: string, members: CharacterInput[]) => Promise<WarbandDefinition | null>
  onAddMember: (warbandId: string, member: CharacterInput) => void
  onRemoveMember: (warbandId: string, memberKey: string) => void
  onClaim: (warbandId: string, code: string) => Promise<string | null>
}

const REGIONS = ['us', 'eu', 'kr', 'tw', 'cn']

function memberKey(m: CharacterInput): string {
  return `${m.name}-${m.realm}-${m.region}`.toLowerCase()
}

/** Name + realm + region, shared by the create form and the add-member row. */
function CharacterFields({ onSubmit, submitLabel }: {
  onSubmit: (input: CharacterInput) => void
  submitLabel: string
}) {
  const [name, setName] = useState('')
  const [realm, setRealm] = useState('')
  const [region, setRegion] = useState('us')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim(), r = realm.trim()
    if (!n || !r) return
    onSubmit({ name: n, realm: r, region })
    setName('')
    setRealm('')
  }

  return (
    <form className="add-form mn-char-form" onSubmit={handleSubmit}>
      <input type="text" placeholder="Character name" value={name} onChange={e => setName(e.target.value)} required />
      <input type="text" placeholder="Realm" value={realm} onChange={e => setRealm(e.target.value)} required />
      <select value={region} onChange={e => setRegion(e.target.value)}>
        {REGIONS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
      </select>
      <button type="submit" disabled={!name.trim() || !realm.trim()}>{submitLabel}</button>
    </form>
  )
}

function CreateWarband({ onCreate }: { onCreate: Props['onCreate'] }) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState<CharacterInput[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [claimCode, setClaimCode] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim() || members.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const created = await onCreate(name.trim(), members)
      // Hold on the access code — it is the only way back in from another PC.
      if (created?.claimCode) setClaimCode(created.claimCode)
      setName('')
      setMembers([])
    } finally {
      setSubmitting(false)
    }
  }

  if (claimCode) {
    return (
      <div className="mn-card mn-card-created">
        <h3 className="mn-card-title">Warband created</h3>
        <p className="wm-claim-hint">
          Save this access code. Entering it on another browser gives that device
          ownership — it is how you get back in if you clear your browser data.
        </p>
        <div className="wm-claim-code-row">
          <code className="wm-claim-code">{claimCode}</code>
          <button className="wm-claim-copy" onClick={() => navigator.clipboard?.writeText(claimCode)}>
            Copy
          </button>
        </div>
        <button className="warband-create-btn" onClick={() => setClaimCode(null)}>Done</button>
      </div>
    )
  }

  return (
    <div className="mn-card">
      <h3 className="mn-card-title">Create your warband</h3>
      <p className="mn-card-sub">
        You do not have a warband on this browser yet. Add the characters you can
        bring to heroic, then create it — you sign up one of them per raid night.
      </p>
      <input
        className="warband-name-input"
        type="text"
        placeholder="Warband name (e.g. Brandan's Warband)"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <CharacterFields onSubmit={input => {
        setMembers(prev => prev.some(m => memberKey(m) === memberKey(input)) ? prev : [...prev, input])
      }} submitLabel="Add" />

      {members.length > 0 && (
        <ul className="warband-member-list">
          {members.map(m => (
            <li key={memberKey(m)} className="warband-member-chip">
              <span className="warband-member-chip-name">{m.name}</span>
              <span className="warband-member-chip-realm">{m.realm} · {m.region.toUpperCase()}</span>
              <button
                className="remove-btn"
                onClick={() => setMembers(prev => prev.filter(x => memberKey(x) !== memberKey(m)))}
              >✕</button>
            </li>
          ))}
        </ul>
      )}

      <button
        className="warband-create-btn"
        onClick={handleCreate}
        disabled={!name.trim() || members.length === 0 || submitting}
      >
        {submitting ? 'Creating…' : 'Create Warband'}
      </button>
    </div>
  )
}

function ClaimExisting({ others, onClaim }: { others: WarbandEntry[]; onClaim: Props['onClaim'] }) {
  const [open, setOpen] = useState(false)
  const [warbandId, setWarbandId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleClaim(e: FormEvent) {
    e.preventDefault()
    if (!warbandId || !code.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      setError(await onClaim(warbandId, code.trim()))
    } finally {
      setSubmitting(false)
    }
  }

  if (others.length === 0) return null

  if (!open) {
    return (
      <button className="mn-link-btn" onClick={() => setOpen(true)}>
        Already have a warband on another PC?
      </button>
    )
  }

  return (
    <div className="mn-card">
      <h3 className="mn-card-title">Recover your warband</h3>
      <p className="mn-card-sub">
        Pick your warband and enter its access code to manage it from this browser.
      </p>
      <form className="wm-claim-form mn-claim-form" onSubmit={handleClaim}>
        <select value={warbandId} onChange={e => setWarbandId(e.target.value)}>
          <option value="">Select warband…</option>
          {others.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <input
          type="text"
          placeholder="Access code"
          value={code}
          onChange={e => setCode(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" disabled={!warbandId || !code.trim() || submitting}>
          {submitting ? 'Checking…' : 'Claim'}
        </button>
      </form>
      {error && <p className="wm-claim-error">{error}</p>}
    </div>
  )
}

export function WarbandPanel({
  owned, others, looks, onCreate, onAddMember, onRemoveMember, onClaim,
}: Props) {
  const [showCode, setShowCode] = useState<string | null>(null)

  return (
    <div className="mn-warbands">
      {owned.map(warband => (
        <div key={warband.id} className="mn-card">
          <div className="mn-card-head">
            <h3 className="mn-card-title">{warband.name}</h3>
            <span className="mn-card-meta">
              {warband.members.length} character{warband.members.length === 1 ? '' : 's'}
            </span>
            {warband.claimCode && (
              <button
                className="mn-link-btn"
                onClick={() => setShowCode(showCode === warband.id ? null : warband.id)}
              >
                {showCode === warband.id ? 'Hide code' : 'Access code'}
              </button>
            )}
          </div>

          {showCode === warband.id && warband.claimCode && (
            <div className="wm-claim-code-row">
              <code className="wm-claim-code">{warband.claimCode}</code>
              <button
                className="wm-claim-copy"
                onClick={() => navigator.clipboard?.writeText(warband.claimCode!)}
              >Copy</button>
            </div>
          )}

          <ul className="warband-member-list">
            {warband.members.map(m => {
              const look = looks[charKey(m)]
              return (
                <li key={memberKey(m)} className="warband-member-chip mn-member-chip">
                  <SpecIcon
                    characterClass={look?.className}
                    specName={look?.specName}
                    emptyTitle={look?.status === 'error' ? 'Character not found on raider.io' : undefined}
                  />
                  <span
                    className="warband-member-chip-name"
                    style={{ color: classColor(look?.className) }}
                  >{m.name}</span>
                  {look?.specName && (
                    <span className="mn-member-spec">{look.specName} {look.className}</span>
                  )}
                  <span className="warband-member-chip-realm">{m.realm} · {m.region.toUpperCase()}</span>
                  <button
                    className="remove-btn"
                    title="Remove from warband"
                    onClick={() => onRemoveMember(warband.id, memberKey(m))}
                  >✕</button>
                </li>
              )
            })}
          </ul>

          <CharacterFields
            onSubmit={input => onAddMember(warband.id, input)}
            submitLabel="Add to warband"
          />
        </div>
      ))}

      {owned.length === 0 && <CreateWarband onCreate={onCreate} />}
      <ClaimExisting others={others} onClaim={onClaim} />
    </div>
  )
}
