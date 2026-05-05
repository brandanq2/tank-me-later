import { useState, type FormEvent } from 'react'
import type { CharacterInput } from '../types'

interface Props {
  onCreate: (name: string, members: CharacterInput[]) => Promise<unknown>
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
      await onCreate(warbandName.trim(), members)
      members.forEach(onAddCharacter)
      setWarbandName('')
      setMembers([])
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    setOpen(false)
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
