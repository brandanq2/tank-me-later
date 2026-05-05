import { useState, useEffect, useCallback } from 'react'
import {
  fetchWarbands, createWarband, updateWarbandMembers, deleteWarband, persistCharacter,
} from '../api'
import type { CharacterEntry, CharacterInput, WarbandDefinition, WarbandEntry, WarbandRun } from '../types'

function charKey(c: CharacterInput): string {
  return `${c.name}-${c.realm}-${c.region}`.toLowerCase()
}

function computeWarbandEntry(def: WarbandDefinition, loadedEntries: CharacterEntry[]): WarbandEntry {
  const keyMap = new Map(loadedEntries.map(e => [charKey(e), e]))

  const members: CharacterEntry[] = def.members.map(m =>
    keyMap.get(charKey(m)) ?? { ...m, id: charKey(m), status: 'loading' as const }
  )

  const allRuns: WarbandRun[] = []
  for (const member of members) {
    if (member.status === 'success' && member.bestRuns) {
      for (const run of member.bestRuns) {
        allRuns.push({
          ...run,
          characterName: member.name,
          characterClass: member.className,
          thumbnailUrl: member.thumbnailUrl,
        })
      }
    }
  }

  const topRuns = [...allRuns].sort((a, b) => b.score - a.score).slice(0, 8)
  const score = topRuns.reduce((sum, r) => sum + r.score, 0)

  const contributorKeys = new Set(topRuns.map(r => r.characterName.toLowerCase()))
  const contributors = members.filter(m => contributorKeys.has(m.name.toLowerCase()))

  return { id: def.id, name: def.name, ownerSessionId: def.ownerSessionId, score, members, topRuns, contributors }
}

export function useWarbands(loadedEntries: CharacterEntry[], sessionId: string) {
  const [definitions, setDefinitions] = useState<WarbandDefinition[]>([])

  useEffect(() => {
    fetchWarbands().then(setDefinitions).catch(() => {})
  }, [])

  const warbandEntries = definitions.map(def => computeWarbandEntry(def, loadedEntries))
  const warbandMemberKeys = new Set(definitions.flatMap(d => d.members.map(charKey)))

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

  return { warbandEntries, warbandMemberKeys, addWarband, removeMember, removeWarband }
}
