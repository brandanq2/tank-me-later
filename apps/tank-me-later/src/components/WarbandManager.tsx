import { useState, type FormEvent } from 'react'
import type { CharacterInput, WarbandDefinition } from '@tml/shared/types'

interface Props {
  onCreate: (name: string, members: CharacterInput[]) => Promise<WarbandDefinition | null>
  onAddCharacter: (input: CharacterInput) => void
}

const REGIONS = ['us', 'eu', 'kr', 'tw', 'cn']

export function WarbandManager({ onCreate, onAddCharacter }: Props) {
  const [open, setOpen] = useState(false)
  const [warbandName, setWarbandName] = useState('')
  const [members, setMembers] = useState<CharacterInput[]>([])
  const [charName, setCharName] = useState('')
  const [charRealm, setCharRealm] = useState('')
  const [charRegion, setCharRegion] = useState('us')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ name: string; claimCode: string } | null>(null)

  function handleAddMember(e: FormEvent) {
    e.preventDefault()
    const n = charName.trim(), r = charRealm.trim()
    if (!n || !r) return
    const input: CharacterInput = { name: n, realm: r, region: charRegion }
    const key = `${n}-${r}-${charRegion}`.toLowerCase()
    if (!members.some(m => `${m.name}-${m.realm}-${m.region}`.toLowerCase() === key)) {
      setMembers(prev => [...prev, input])
    }
    setCharName('')
    setCharRealm('')
  }

  function removeMember(key: string) {
    setMembers(prev => prev.filter(m => `${m.name}-${m.realm}-${m.region}`.toLowerCase() !== key))
  }

  async function handleCreate() {
    if (!warbandName.trim() || members.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const warband = await onCreate(warbandName.trim(), members)
      members.forEach(onAddCharacter)
      // Hold the panel open on the access code — it is the only way back in
      // if this browser's storage is ever lost.
      if (warband?.claimCode) {
        setCreated({ name: warband.name, claimCode: warband.claimCode })
      } else {
        setOpen(false)
      }
      setWarbandName('')
      setMembers([])
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    setOpen(false)
    setCreated(null)
    setWarbandName('')
    setMembers([])
    setCharName('')
    setCharRealm('')
  }

  if (!open) {
    return (
      <button className="refresh-btn" onClick={() => setOpen(true)}>
        ⚔ Create Warband
      </button>
    )
  }

  if (created) {
    return (
      <div className="warband-manager">
        <div className="warband-manager-header">
          <span className="warband-manager-title">{created.name} created</span>
          <button className="cm-close" style={{ position: 'static' }} onClick={handleClose}>✕</button>
        </div>
        <p className="wm-claim-hint">
          Save this access code. Entering it on another browser or PC gives that
          device ownership of the warband — it's how you get back in if you
          clear your browser data or switch machines.
        </p>
        <div className="wm-claim-code-row">
          <code className="wm-claim-code">{created.claimCode}</code>
          <button
            className="wm-claim-copy"
            onClick={() => { navigator.clipboard?.writeText(created.claimCode) }}
          >Copy</button>
        </div>
        <button className="warband-create-btn" onClick={handleClose}>Done</button>
      </div>
    )
  }

  return (
    <div className="warband-manager">
      <div className="warband-manager-header">
        <span className="warband-manager-title">New Warband</span>
        <button className="cm-close" style={{ position: 'static' }} onClick={handleClose}>✕</button>
      </div>

      <input
        className="warband-name-input"
        type="text"
        placeholder="Warband name (e.g. Brandan's Warband)"
        value={warbandName}
        onChange={e => setWarbandName(e.target.value)}
      />

      <form className="add-form" onSubmit={handleAddMember}>
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
          {REGIONS.map(r => (
            <option key={r} value={r}>{r.toUpperCase()}</option>
          ))}
        </select>
        <button type="submit" disabled={!charName.trim() || !charRealm.trim()}>Add</button>
      </form>

      {members.length > 0 && (
        <ul className="warband-member-list">
          {members.map(m => {
            const key = `${m.name}-${m.realm}-${m.region}`.toLowerCase()
            return (
              <li key={key} className="warband-member-chip">
                <span className="warband-member-chip-name">{m.name}</span>
                <span className="warband-member-chip-realm">{m.realm} · {m.region.toUpperCase()}</span>
                <button className="remove-btn" onClick={() => removeMember(key)}>✕</button>
              </li>
            )
          })}
        </ul>
      )}

      <button
        className="warband-create-btn"
        onClick={handleCreate}
        disabled={!warbandName.trim() || members.length === 0 || submitting}
      >
        {submitting ? 'Creating…' : 'Create Warband'}
      </button>
    </div>
  )
}
