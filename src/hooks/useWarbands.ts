import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  fetchWarbands, createWarband, updateWarbandMembers, deleteWarband, persistCharacter,
  reportWarbandScore,
} from '../api'
import type { CharacterEntry, CharacterInput, WarbandDefinition, WarbandEntry, WarbandRun } from '../types'

// Normalize realm slugs so "Zul'jin", "zul-jin", and "zuljin" all match.
function normalizeRealm(realm: string): string {
  return realm.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function charKey(c: CharacterInput): string {
  return `${c.name.toLowerCase()}-${normalizeRealm(c.realm)}-${c.region.toLowerCase()}`
}

function computeWarbandEntry(def: WarbandDefinition, loadedEntries: CharacterEntry[]): WarbandEntry {
  const keyMap = new Map(loadedEntries.map(e => [charKey(e), e]))

  const members: CharacterEntry[] = def.members.map(m =>
    keyMap.get(charKey(m)) ?? { ...m, id: charKey(m), status: 'loading' as const }
  )

  // Best run per dungeon across all members — prevents the same dungeon
  // from being counted twice when multiple characters share a key.
  const bestByDungeon = new Map<string, WarbandRun>()
  for (const member of members) {
    if (member.status === 'success' && member.bestRuns) {
      for (const run of member.bestRuns) {
        const existing = bestByDungeon.get(run.shortName)
        if (!existing || run.score > existing.score) {
          bestByDungeon.set(run.shortName, {
            ...run,
            characterName: member.name,
            characterClass: member.className,
            thumbnailUrl: member.thumbnailUrl,
          })
        }
      }
    }
  }

  const topRuns = [...bestByDungeon.values()].sort((a, b) => b.score - a.score).slice(0, 8)
  const score = topRuns.reduce((sum, r) => sum + r.score, 0)

  const contributorKeys = new Set(topRuns.map(r => r.characterName.toLowerCase()))
  const contributors = members.filter(m => contributorKeys.has(m.name.toLowerCase()))

  return { id: def.id, name: def.name, ownerSessionId: def.ownerSessionId, score, members, topRuns, contributors }
}

export function useWarbands(loadedEntries: CharacterEntry[], sessionId: string) {
  const [definitions, setDefinitions] = useState<WarbandDefinition[]>([])
  const [warbandsLoaded, setWarbandsLoaded] = useState(false)

  useEffect(() => {
    fetchWarbands()
      .then(data => { setDefinitions(data); setWarbandsLoaded(true) })
      .catch(() => setWarbandsLoaded(true))
  }, [])

  const baseWarbandEntries = useMemo(
    () => definitions.map(def => computeWarbandEntry(def, loadedEntries)),
    [definitions, loadedEntries],
  )
  const warbandMemberKeys = new Set(definitions.flatMap(d => d.members.map(charKey)))

  const [warbandDeltas, setWarbandDeltas] = useState<Record<string, number>>({})
  const reportedScoresRef = useRef(new Map<string, number>())

  useEffect(() => {
    for (const wb of baseWarbandEntries) {
      const allMembersLoaded = wb.members.every(m => m.status === 'success')
      if (!allMembersLoaded || wb.score <= 0) continue
      if (reportedScoresRef.current.get(wb.id) === wb.score) continue
      reportedScoresRef.current.set(wb.id, wb.score)
      reportWarbandScore(wb.id, wb.score).then(delta => {
        setWarbandDeltas(prev => ({ ...prev, [wb.id]: delta }))
      }).catch(() => {})
    }
  }, [baseWarbandEntries])

  const warbandEntries = useMemo(
    () => baseWarbandEntries.map(wb => ({ ...wb, scoreDelta: warbandDeltas[wb.id] })),
    [baseWarbandEntries, warbandDeltas],
  )

  const addWarband = useCallback(async (name: string, members: CharacterInput[]) => {
    await Promise.allSettled(members.map(m => persistCharacter(m, 'open')))
    const created = await createWarband(name, members, sessionId)
    if (created) setDefinitions(prev => [...prev, created])
    return created
  }, [sessionId])

  const removeMember = useCallback(async (warbandId: string, memberKey: string) => {
    const warband = definitions.find(d => d.id === warbandId)
    if (!warband || warband.ownerSessionId !== sessionId) return
    const updated = warband.members.filter(m => charKey(m) !== memberKey)
    const result = await updateWarbandMembers(warbandId, updated, sessionId)
    if (result) setDefinitions(prev => prev.map(d => d.id === warbandId ? result : d))
  }, [definitions, sessionId])

  const removeWarband = useCallback(async (warbandId: string) => {
    const ok = await deleteWarband(warbandId, sessionId)
    if (ok) setDefinitions(prev => prev.filter(d => d.id !== warbandId))
  }, [sessionId])

  return { warbandEntries, warbandMemberKeys, warbandsLoaded, addWarband, removeMember, removeWarband }
}
