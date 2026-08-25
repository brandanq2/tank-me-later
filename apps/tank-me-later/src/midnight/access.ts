import { useEffect, useState } from 'react'

/**
 * The invite code doubles as the credential: it lives in localStorage and rides
 * along on every request. There is nothing to expire, so losing it just means
 * asking the organizer for the code again.
 *
 * The Strike Team nav link only appears once a code is stored, which is why this
 * is a subscribable store rather than a plain read — unlocking the page has to
 * light up the nav in the same render.
 */

const CODE_KEY = 'tank-me-later:midnight:code'
const ROLE_KEY = 'tank-me-later:midnight:role'
const CHANGE_EVENT = 'tank-me-later:midnight:access-change'

export type MidnightRole = 'member' | 'organizer'

export interface MidnightAccess {
  code: string | null
  role: MidnightRole | null
}

function read(): MidnightAccess {
  try {
    const code = localStorage.getItem(CODE_KEY)
    const stored = localStorage.getItem(ROLE_KEY)
    const role = stored === 'organizer' || stored === 'member' ? stored : null
    return { code, role }
  } catch {
    // Private-mode Safari and friends throw on localStorage access.
    return { code: null, role: null }
  }
}

export function getMidnightCode(): string | null {
  return read().code
}

export function storeMidnightAccess(code: string, role: MidnightRole): void {
  try {
    localStorage.setItem(CODE_KEY, code)
    localStorage.setItem(ROLE_KEY, role)
  } catch { /* nothing we can do — the session just won't be remembered */ }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function clearMidnightAccess(): void {
  try {
    localStorage.removeItem(CODE_KEY)
    localStorage.removeItem(ROLE_KEY)
  } catch { /* see storeMidnightAccess */ }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useMidnightAccess(): MidnightAccess {
  const [access, setAccess] = useState<MidnightAccess>(read)

  useEffect(() => {
    const sync = () => setAccess(read())
    window.addEventListener(CHANGE_EVENT, sync)
    // `storage` covers the same page open in a second tab.
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return access
}
