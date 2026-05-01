import { useState, useCallback, useEffect, useRef } from 'react'
import { fetchCharacter, fetchCutoff, fetchHistory, listCharacters, persistCharacter, removePersistedCharacter, reportScore, getSessionId, fetchVotes, initiateVote, castVote } from './api'
import type { CutoffData } from './api'
import { AddCharacterForm } from './components/AddCharacterForm'
import { LeaderboardRow } from './components/LeaderboardRow'
import { VoteModal } from './components/VoteModal'
import type { CharacterEntry, CharacterInput, VoteRecord } from './types'

function makeId() {
  return Math.random().toString(36).slice(2)
}

const OWNED_STORAGE_KEY = 'tank-me-later:owned'

function getOwnedKeys(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OWNED_STORAGE_KEY) ?? '[]'))
  } catch { return new Set() }
}

function saveOwnedKey(key: string) {
  try {
    const keys = getOwnedKeys()
    keys.add(key)
    localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify([...keys]))
  } catch {}
}

function removeOwnedKey(key: string) {
  try {
    const keys = getOwnedKeys()
    keys.delete(key)
    localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify([...keys]))
  } catch {}
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

function revealDelay(rank: number): number {
  if (rank === 1) return 0
  if (rank === 2) return 1.1
  if (rank === 3) return 1.9
  return 2.5
}

export default function App() {
  const [entries, setEntries] = useState<CharacterEntry[]>([])
  const [anyLoading, setAnyLoading] = useState(false)
  const [cutoff, setCutoff] = useState<CutoffData | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [votes, setVotes] = useState<VoteRecord[]>([])
  const [hiddenVoteKeys, setHiddenVoteKeys] = useState<string[]>([])
  const addedKeys = useRef(new Set<string>())
  const initialIds = useRef(new Set<string>())
  const sessionId = useRef(getSessionId())

  const addCharacter = useCallback(async (input: CharacterInput, isOwned = false) => {
    const key = `${input.name}-${input.realm}-${input.region}`.toLowerCase()
    if (addedKeys.current.has(key)) return
    addedKeys.current.add(key)

    if (isOwned) saveOwnedKey(key)

    const id = makeId()
    const pending: CharacterEntry = { ...input, id, status: 'loading', isOwned }

    setEntries((prev) => [...prev, pending])
    setAnyLoading(true)
    persistCharacter(input).catch(() => {})

    try {
      const [data, history] = await Promise.all([fetchCharacter(input), fetchHistory(input)])
      const { delta: scoreDelta, prevRank } = await reportScore(input, data.score).catch(() => ({ delta: 0, prevRank: null }))
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, status: 'success', ...data, scoreDelta, prevRank: prevRank ?? undefined, history }
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
      const ownedKeys = getOwnedKeys()
      seed.forEach((char) => {
        const key = `${char.name}-${char.realm}-${char.region}`.toLowerCase()
        addCharacter(char, ownedKeys.has(key))
      })
    }).catch(() => {
      // API unavailable (local dev without vercel dev) — fall back to defaults
      INITIAL_CHARACTERS.forEach((char) => addCharacter(char))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isFirstVoteFetch = useRef(true)
  useEffect(() => {
    const poll = () => fetchVotes().then((fetched) => {
      if (isFirstVoteFetch.current) {
        isFirstVoteFetch.current = false
        const alreadyVoted = fetched
          .filter(v => v.yesVotes.includes(sessionId.current) || v.noVotes.includes(sessionId.current))
          .map(v => v.charKey)
        if (alreadyVoted.length > 0) {
          setHiddenVoteKeys(prev => [...new Set([...prev, ...alreadyVoted])])
        }
      }
      setVotes(fetched)
    }).catch(() => {})
    poll()
    const interval = setInterval(poll, 10_000)
    return () => clearInterval(interval)
  }, [])

  const removeCharacter = useCallback((id: string) => {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id)
      if (target) {
        const key = `${target.name}-${target.realm}-${target.region}`.toLowerCase()
        addedKeys.current.delete(key)
        removeOwnedKey(key)
        removePersistedCharacter(target).catch(() => {})
      }
      return prev.filter((e) => e.id !== id)
    })
  }, [])

  const refreshAll = useCallback(async () => {
    initialIds.current.clear()
    setIsRefreshing(true)
    setAnyLoading(true)

    const loadingEntries = entries.map((e) => ({ ...e, status: 'loading' as const }))
    setEntries(loadingEntries)

    const saved = await listCharacters().catch((): CharacterInput[] => [])
    const newChars = saved.filter((c) => {
      const key = `${c.name}-${c.realm}-${c.region}`.toLowerCase()
      return !addedKeys.current.has(key)
    })
    newChars.forEach((c) => addedKeys.current.add(`${c.name}-${c.realm}-${c.region}`.toLowerCase()))

    const newEntries: CharacterEntry[] = newChars.map((char) => ({
      ...char, id: makeId(), status: 'loading' as const,
    }))

    const allEntries = [...loadingEntries, ...newEntries]
    if (newEntries.length > 0) {
      setEntries(allEntries)
    }

    await Promise.allSettled(
      allEntries.map(async (e) => {
        try {
          const [data, history] = await Promise.all([fetchCharacter(e), fetchHistory(e)])
          const { delta: scoreDelta, prevRank } = await reportScore(e, data.score).catch(() => ({ delta: 0, prevRank: null }))
          setEntries((prev) =>
            prev.map((entry) => (entry.id === e.id ? { ...entry, status: 'success', ...data, scoreDelta, prevRank: prevRank ?? undefined, history } : entry))
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          setEntries((prev) =>
            prev.map((entry) => (entry.id === e.id ? { ...entry, status: 'error', error: msg } : entry))
          )
        }
      })
    )

    allEntries.forEach((e) => { initialIds.current.add(e.id) })
    setIsRefreshing(false)
    setAnyLoading(false)
  }, [entries])

  useEffect(() => {
    if (revealed || entries.length === 0) return
    if (entries.every((e) => e.status !== 'loading')) {
      entries.forEach((e) => initialIds.current.add(e.id))
      setRevealed(true)
    }
  }, [entries, revealed])

  const handleRemoveOrVote = useCallback((id: string) => {
    const target = entries.find(e => e.id === id)
    if (!target) return
    if (target.isOwned) {
      removeCharacter(id)
    } else {
      initiateVote(target, sessionId.current)
        .then((newVote) => {
          if (newVote) setVotes(prev => [...prev.filter(v => v.charKey !== newVote.charKey), newVote])
        })
        .catch(() => {})
    }
  }, [entries, removeCharacter])

  const handleVoteCast = useCallback(async (charKey: string, vote: 'yes' | 'no') => {
    const result = await castVote(charKey, vote, sessionId.current)
    if (!result) return
    if (result.resolved) {
      setEntries(prev => prev.filter(e => `${e.name}-${e.realm}-${e.region}`.toLowerCase() !== charKey))
      addedKeys.current.delete(charKey)
      setVotes(prev => prev.filter(v => v.charKey !== charKey))
      setHiddenVoteKeys(prev => prev.filter(k => k !== charKey))
    } else {
      setVotes(prev => prev.map(v => v.charKey === charKey ? result : v))
    }
  }, [])

  const sorted = sortedEntries(entries)
  const leaderboard = sorted.filter((e) => e.status !== 'success' || (e.score ?? 0) > 0)
  const clowns = sorted.filter((e) => e.status === 'success' && (e.score ?? 0) === 0)

  const loadedScores = leaderboard.filter((e) => e.status === 'success').map((e) => e.score ?? 0)
  const groupMax = loadedScores.length ? Math.max(...loadedScores) : 0
  const cutoffScore = cutoff?.score ?? groupMax

  return (
    <div className="app">
      <header className="header">
        <h1 className="title-stack">
          <span>Tank</span>
          <span><span className="title-accent">BTW</span> Me</span>
          <span>Later</span>
        </h1>
        <p className="subtitle">Mythic+ Tank IO Leaderboard</p>
        <p className="header-disclaimer">Yeah, I know what I said.</p>
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
        <AddCharacterForm onAdd={(input) => addCharacter(input, true)} loading={anyLoading} />
        {entries.length > 0 && (
          <button className="refresh-btn" onClick={refreshAll} disabled={anyLoading}>
            Refresh All
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="empty">Add characters above to build your leaderboard.</p>
      ) : (
        <div className={revealed && !isRefreshing ? undefined : 'pre-reveal'}>
          <div className="leaderboard">
            {leaderboard.map((entry, i) => {
              const rank = i + 1
              const rankDelta = entry.prevRank != null ? entry.prevRank - rank : undefined
              const charKey = `${entry.name}-${entry.realm}-${entry.region}`.toLowerCase()
              const activeVote = votes.find(v => v.charKey === charKey)
              return (
                <LeaderboardRow
                  key={entry.id}
                  entry={entry}
                  rank={rank}
                  rankDelta={rankDelta}
                  activeVote={activeVote}
                  sessionId={sessionId.current}
                  cutoffScore={cutoffScore}
                  revealed={revealed}
                  isInitialEntry={initialIds.current.has(entry.id)}
                  revealDelay={revealDelay(rank)}
                  onRemove={handleRemoveOrVote}
                />
              )
            })}
          </div>

          {clowns.length > 0 && (
            <div className="clown-section">
              <h2 className="clown-title">🤡 Clown List</h2>
              <p className="clown-subtitle">0 tank IO this season</p>
              <div className="leaderboard">
                {clowns.map((entry) => {
                  const clownDelay = revealDelay(leaderboard.length + 1)
                  const charKey = `${entry.name}-${entry.realm}-${entry.region}`.toLowerCase()
                  const activeVote = votes.find(v => v.charKey === charKey)
                  return (
                    <LeaderboardRow
                      key={entry.id}
                      entry={entry}
                      rank={0}
                      activeVote={activeVote}
                      sessionId={sessionId.current}
                      cutoffScore={cutoffScore}
                      revealed={revealed}
                      isInitialEntry={initialIds.current.has(entry.id)}
                      revealDelay={clownDelay}
                      onRemove={handleRemoveOrVote}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <VoteModal
        votes={votes.filter(v => !hiddenVoteKeys.includes(v.charKey))}
        sessionId={sessionId.current}
        onVote={handleVoteCast}
        onClose={() => {
          const visibleKeys = votes.filter(v => !hiddenVoteKeys.includes(v.charKey)).map(v => v.charKey)
          setHiddenVoteKeys(prev => [...new Set([...prev, ...visibleKeys])])
        }}
      />
    </div>
  )
}
