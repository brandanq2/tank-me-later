import { useState, type FormEvent } from 'react'
import type { CharacterInput } from '../types'

interface Props {
  onAdd: (char: CharacterInput) => void
  loading: boolean
}

const REGIONS = ['us', 'eu', 'kr', 'tw', 'cn']

export function AddCharacterForm({ onAdd, loading }: Props) {
  const [name, setName] = useState('')
  const [realm, setRealm] = useState('')
  const [region, setRegion] = useState('us')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedRealm = realm.trim()
    if (!trimmedName || !trimmedRealm) return
    onAdd({ name: trimmedName, realm: trimmedRealm, region })
    setName('')
    setRealm('')
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Character name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={loading}
        required
      />
      <input
        type="text"
        placeholder="Realm (e.g. illidan)"
        value={realm}
        onChange={(e) => setRealm(e.target.value)}
        disabled={loading}
        required
      />
      <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={loading}>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {r.toUpperCase()}
          </option>
        ))}
      </select>
      <button type="submit" disabled={loading || !name.trim() || !realm.trim()}>
        Add
      </button>
    </form>
  )
}
