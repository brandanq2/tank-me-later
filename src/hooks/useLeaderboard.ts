import { useState, useCallback, useEffect, useRef } from 'react'
import {
  fetchCharacter, fetchCutoff, fetchHistory,
  listCharacters, persistCharacter, removePersistedCharacter,
  reportScore, getSessionId, fetchVotes, initiateVote, castVote,
} from '../api'
import type { CharacterData, CutoffData } from '../api'
import type { CharacterEntry, CharacterInput, VoteRecord } from '../types'

export interface LeaderboardConfig {
  listId: string
  ownedStorageKey: string
  initialCharacters: CharacterInput[]
  scoreField: 'tank' | 'dps' | 'all'
  validate?: (data: CharacterData) => string | null
}

function makeId() {
  return Math.random().toString(36).slice(2)
}

function getOwnedKeys(storageKey: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]'))
  } catch { return new Set() }
}

function saveOwnedKey(storageKey: string, key: string) {
  try {
    const keys = getOwnedKeys(storageKey)
    keys.add(key)
    localStorage.setItem(storageKey, JSON.stringify([...keys]))
  } catch {}
}

function removeOwnedKey(storageKey: string, key: string) {
  try {
    const keys = getOwnedKeys(storageKey)
    keys.delete(key)
    localStorage.setItem(storageKey, JSON.stringify([...keys]))
  } catch {}
}

export function sortedEntries(entries: CharacterEntry[]): CharacterEntry[] {
  return [...entries].sort((a, b) => {
    if (a.status === 'loading' && b.status !== 'loading') return 1
    if (b.status === 'loading' && a.status !== 'loading') return -1
    return (b.score ?? -1) - (a.score ?? -1)
  })
}

export function revealDelay(rank: number): number {
  if (rank === 1) return 0
  if (rank === 2) return 1.1
  if (rank === 3) return 1.9
  return 2.5
}

export function useLeaderboard(config: LeaderboardConfig) {
  const { listId, ownedStorageKey, initialCharacters, scoreField, validate } = config

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

    if (isOwned) saveOwnedKey(ownedStorageKey, key)

    const id = makeId()
    const pending: CharacterEntry = { ...input, id, status: 'loading', isOwned }

    setEntries((prev) => [...prev, pending])
    setAnyLoading(true)

    try {
      const [data, history] = await Promise.all([
        fetchCharacter(input, scoreField),
        fetchHistory(input),
      ])

      const validationError = validate?.(data) ?? null
      if (validationError) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
        addedKeys.current.delete(key)
        if (isOwned) removeOwnedKey(ownedStorageKey, key)
        return
      }

      const { delta: scoreDelta, prevRank } = await reportScore(input, data.score).catch(() => ({ delta: 0, prevRank: null }))
      persistCharacter(input, listId).catch(() => {})
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, status: 'success', ...data, scoreDelta, prevRank: prevRank ?? undefined, history }
            : e
        )
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg === 'Character not found') {
        setEntries((prev) => prev.filter((e) => e.id !== id))
        addedKeys.current.delete(key)
        if (isOwned) removeOwnedKey(ownedStorageKey, key)
      } else {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: 'error', error: msg } : e))
        )
      }
    } finally {
      setAnyLoading(false)
    }
  }, [listId, ownedStorageKey, scoreField, validate])

  useEffect(() => {
    fetchCutoff().then(setCutoff).catch(() => {})

    listCharacters(listId).then((saved) => {
      const seed = saved.length > 0 ? saved : initialCharacters
      if (saved.length === 0 && initialCharacters.length > 0) {
        Promise.all(initialCharacters.map(c => persistCharacter(c, listId))).catch(() => {})
      }
      const ownedKeys = getOwnedKeys(ownedStorageKey)
      seed.forEach((char) => {
        const key = `${char.name}-${char.realm}-${char.region}`.toLowerCase()
        addCharacter(char, ownedKeys.has(key))
      })
    }).catch(() => {
      initialCharacters.forEach((char) => addCharacter(char))
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
        removeOwnedKey(ownedStorageKey, key)
        removePersistedCharacter(target, listId).catch(() => {})
      }
      return prev.filter((e) => e.id !== id)
    })
  }, [listId, ownedStorageKey])

  const refreshAll = useCallback(async () => {
    initialIds.current.clear()
    setIsRefreshing(true)
    setAnyLoading(true)

    const loadingEntries = entries.map((e) => ({ ...e, status: 'loading' as const }))
    setEntries(loadingEntries)

    const saved = await listCharacters(listId).catch((): CharacterInput[] => [])
    const newChars = saved.filter((c) => {
      const key = `${c.name}-${c.realm}-${c.region}`.toLowerCase()
      return !addedKeys.current.has(key)
    })
    newChars.forEach((c) => addedKeys.current.add(`${c.name}-${c.realm}-${c.region}`.toLowerCase()))

    const newEntries: CharacterEntry[] = newChars.map((char) => ({
      ...char, id: makeId(), status: 'loading' as const,
    }))

    const allEntries = [...loadingEntries, ...newEntries]
    if (newEntries.length > 0) setEntries(allEntries)

    await Promise.allSettled(
      allEntries.map(async (e) => {
        try {
          const [data, history] = await Promise.all([fetchCharacter(e, scoreField), fetchHistory(e)])
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
  }, [entries, listId, scoreField])

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
      if (result.failed) {
        setHiddenVoteKeys(prev => [...new Set([...prev, charKey])])
      }
    }
  }, [])

  const sorted = sortedEntries(entries)
  const leaderboard = sorted.filter((e) => e.status !== 'success' || (e.score ?? 0) > 0)
  const clowns = sorted.filter((e) => e.status === 'success' && (e.score ?? 0) === 0)

  const loadedScores = leaderboard.filter((e) => e.status === 'success').map((e) => e.score ?? 0)
  const groupMax = loadedScores.length ? Math.max(...loadedScores) : 0
  const cutoffScore = cutoff?.score ?? groupMax

  return {
    entries,
    anyLoading,
    cutoff,
    revealed,
    isRefreshing,
    votes,
    hiddenVoteKeys,
    sorted,
    leaderboard,
    clowns,
    groupMax,
    cutoffScore,
    sessionId: sessionId.current,
    initialIds: initialIds.current,
    addCharacter,
    refreshAll,
    handleRemoveOrVote,
    handleVoteCast,
    setHiddenVoteKeys,
    setVotes,
  }
}
