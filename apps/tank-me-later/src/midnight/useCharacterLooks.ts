import { useEffect, useRef, useState } from 'react'
import { fetchCharacter } from '../api'
import { charKey } from '../hooks/useWarbands'
import type { CharacterInput } from '@tml/shared/types'

/**
 * Just the cosmetic bits of a character — enough to colour a name and pick a
 * spec icon. The Strike Team page has no use for scores or best runs, so this
 * deliberately does far less than useLeaderboard.
 */
export interface CharacterLook {
  status: 'loading' | 'success' | 'error'
  className?: string
  specName?: string
  thumbnailUrl?: string
}

/**
 * Fetches raider.io data for whichever characters are on screen, keyed by
 * charKey. Each character is requested at most once per mount, so re-renders
 * and newly added warband members never re-hit the API for names already known.
 */
export function useCharacterLooks(characters: CharacterInput[]): Record<string, CharacterLook> {
  const [looks, setLooks] = useState<Record<string, CharacterLook>>({})
  const requested = useRef(new Set<string>())

  useEffect(() => {
    for (const character of characters) {
      const key = charKey(character)
      if (requested.current.has(key)) continue
      requested.current.add(key)

      setLooks(prev => ({ ...prev, [key]: { status: 'loading' } }))
      fetchCharacter(character, 'all')
        .then(data => setLooks(prev => ({
          ...prev,
          [key]: {
            status: 'success',
            className: data.className,
            specName: data.specName,
            thumbnailUrl: data.thumbnailUrl,
          },
        })))
        // A missing or renamed character should not break the roster around it.
        .catch(() => setLooks(prev => ({ ...prev, [key]: { status: 'error' } })))
    }
  }, [characters])

  return looks
}
