import { useState, useCallback, useEffect, useRef } from 'react'
import { fetchCharacter, fetchCutoff, listCharacters, persistCharacter, removePersistedCharacter } from './api'
import type { CutoffData } from './api'
import { AddCharacterForm } from './components/AddCharacterForm'
import { LeaderboardRow } from './components/LeaderboardRow'
import type { CharacterEntry, CharacterInput } from './types'

function makeId() {
  return Math.random().toString(36).slice(2)
}

function sortedEntries(entries: CharacterEntry[]): CharacterEntry[] {
  return [...entries].sort((a, b) => {
    if (a.status === 'loading' && b.status !== 'loading') return 1
    if (b.status === 'loading' && a.status !== 'loading') return -1
    return (b.score ?? -1) - (a.score ?? -1)
  })
}

const INITIAL_CHARACTERS: CharacterInput[] = [
  { name: 'Vokeox',     realm: 'thrall',  region: 'us' },
  { name: 'Jacob',      realm: 'zuljin',  region: 'us' },
  { name: 'Hazzyipa',   realm: 'zuljin',  region: 'us' },
  { name: 'Prev',       realm: 'thrall',  region: 'us' },
  { name: 'Volgorion',  realm: 'khadgar', region: 'us' },
  { name: 'Woodworker', realm: 'zuljin',  region: 'us' },
]

export default function App() {
  const [entries, setEntries] = useState<CharacterEntry[]>([])
  const [anyLoading, setAnyLoading] = useState(false)
  const [cutoff, setCutoff] = useState<CutoffData | null>(null)
  const addedKeys = useRef(new Set<string>())

  const addCharacter = useCallback(async (input: CharacterInput) => {
    const key = `${input.name}-${input.realm}-${input.region}`.toLowerCase()
    if (addedKeys.current.has(key)) return
    addedKeys.current.add(key)

    const id = makeId()
    const pending: CharacterEntry = { ...input, id, status: 'loading' }

    setEntries((prev) => [...prev, pending])
    setAnyLoading(true)
    persistCharacter(input).catch(() => {})

    try {
      const data = await fetchCharacter(input)
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, status: 'success', ...data }
            : e
        )
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'error', error: msg } : e))
      )
    } finally {
      setAnyLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCutoff().then(setCutoff).catch(() => {})

    listCharacters().then((saved) => {
      const seed = saved.length > 0 ? saved : INITIAL_CHARACTERS
      if (saved.length === 0) {
        // Persist the defaults on first load
        Promise.all(INITIAL_CHARACTERS.map(persistCharacter)).catch(() => {})
      }
      seed.forEach((char) => addCharacter(char))
    }).catch(() => {
      // API unavailable (local dev without vercel dev) — fall back to defaults
      INITIAL_CHARACTERS.forEach((char) => addCharacter(char))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeCharacter = useCallback((id: string) => {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id)
      if (target) {
        const key = `${target.name}-${target.realm}-${target.region}`.toLowerCase()
        addedKeys.current.delete(key)
        removePersistedCharacter(target).catch(() => {})
      }
      return prev.filter((e) => e.id !== id)
    })
  }, [])

  const refreshAll = useCallback(async () => {
    if (entries.length === 0) return
    setAnyLoading(true)
    const refreshed = entries.map((e) => ({ ...e, status: 'loading' as const }))
    setEntries(refreshed)

    await Promise.allSettled(
      refreshed.map(async (e) => {
        try {
          const data = await fetchCharacter(e)
          setEntries((prev) =>
            prev.map((entry) => (entry.id === e.id ? { ...entry, status: 'success', ...data } : entry))
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          setEntries((prev) =>
            prev.map((entry) => (entry.id === e.id ? { ...entry, status: 'error', error: msg } : entry))
          )
        }
      })
    )
    setAnyLoading(false)
  }, [entries])

  const sorted = sortedEntries(entries)
  const loadedScores = entries.filter((e) => e.status === 'success').map((e) => e.score ?? 0)
  const groupMax = loadedScores.length ? Math.max(...loadedScores) : 0
  const cutoffScore = cutoff?.score ?? groupMax

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Tank Me Later</h1>
        <p className="subtitle">Mythic+ Tank IO Leaderboard</p>
        {cutoff && (
          <p className="cutoff-badge">
            {cutoff.percentile} cutoff&nbsp;
            <span className="cutoff-score">
              {cutoff.score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          </p>
        )}
      </header>

      <div className="controls">
        <AddCharacterForm onAdd={addCharacter} loading={anyLoading} />
        {entries.length > 0 && (
          <button className="refresh-btn" onClick={refreshAll} disabled={anyLoading}>
            Refresh All
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="empty">Add characters above to build your leaderboard.</p>
      ) : (
        <div className="leaderboard">
          {sorted.map((entry, i) => (
            <LeaderboardRow
              key={entry.id}
              entry={entry}
              rank={i + 1}
              cutoffScore={cutoffScore}
              onRemove={removeCharacter}
            />
          ))}
        </div>
      )}
    </div>
  )
}
