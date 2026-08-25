import type { CharacterInput } from '@tml/shared/types'
import { getMidnightCode } from './access'
import type {
  AvailabilityRecord, MidnightState, RaidSlotRecord, SignupRecord,
} from './types'
import { specRole } from './specs'
import { blockStartMinutes, type RaidSlot } from './schedule'

/** Every call after unlock carries the stored invite code. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const code = getMidnightCode()
  return { ...(code ? { 'X-Midnight-Code': code } : {}), ...extra }
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

/** Resolves to the granted role, or an error message to show inline. */
export async function unlockMidnight(
  code: string,
): Promise<{ role: 'member' | 'organizer' } | { error: string }> {
  const res = await fetch('/api/midnight?action=unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) return { error: await errorFrom(res, 'That invite code is not valid') }
  return res.json()
}

/** null means the stored code is no longer accepted — re-prompt for it. */
export async function fetchMidnightState(): Promise<MidnightState | null> {
  const res = await fetch('/api/midnight', { headers: authHeaders() })
  if (!res.ok) return null
  return res.json()
}

export async function saveAvailability(
  warbandId: string,
  sessionId: string,
  slots: string[],
  note: string,
): Promise<AvailabilityRecord | { error: string }> {
  const res = await fetch('/api/midnight?action=availability', {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ warbandId, sessionId, slots, note }),
  })
  if (!res.ok) return { error: await errorFrom(res, 'Could not save your availability') }
  return res.json()
}

export async function lockRaidSlot(
  slot: RaidSlot,
): Promise<RaidSlotRecord | { error: string }> {
  const res = await fetch('/api/midnight?action=raid-slot', {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ day: slot.day, startMinutes: blockStartMinutes(slot.block) }),
  })
  if (!res.ok) return { error: await errorFrom(res, 'Could not lock that slot') }
  return res.json()
}

export async function clearRaidSlot(): Promise<boolean> {
  const res = await fetch('/api/midnight?action=raid-slot', {
    method: 'DELETE',
    headers: authHeaders(),
  })
  return res.ok
}

export async function signUpCharacter(
  warbandId: string,
  sessionId: string,
  character: CharacterInput,
  className: string,
  specName: string,
  note: string,
): Promise<SignupRecord | { error: string }> {
  const res = await fetch('/api/midnight?action=signup', {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      warbandId, sessionId, character, className, specName,
      // Derived here so the server never has to own the spec table.
      role: specRole(className, specName),
      note,
    }),
  })
  if (!res.ok) return { error: await errorFrom(res, 'Could not sign up') }
  return res.json()
}

export async function withdrawSignup(warbandId: string, sessionId: string): Promise<boolean> {
  const params = new URLSearchParams({ action: 'signup', warbandId, session: sessionId })
  const res = await fetch(`/api/midnight?${params}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  return res.ok
}
