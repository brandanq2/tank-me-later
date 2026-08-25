import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './midnight/strike-team.css'
import { Nav } from './components/Nav'
import { InviteGate } from './components/midnight/InviteGate'
import { WarbandPanel } from './components/midnight/WarbandPanel'
import { AvailabilityGrid } from './components/midnight/AvailabilityGrid'
import { AvailabilityCalendar } from './components/midnight/AvailabilityCalendar'
import { AvailabilityReport } from './components/midnight/AvailabilityReport'
import { RaidSlotPanel } from './components/midnight/RaidSlotPanel'
import { useWarbands } from './hooks/useWarbands'
import { getSessionId } from './api'
import { clearMidnightAccess, useMidnightAccess } from './midnight/access'
import {
  clearRaidSlot, fetchMidnightState, lockRaidSlot, saveAvailability, signUpCharacter,
  withdrawSignup,
} from './midnight/api'
import { buildReport, type WarbandRef } from './midnight/report'
import { CANDIDATE_SLOTS, TIMEZONE_LABEL, type Day, type RaidSlot } from './midnight/schedule'
import type { MidnightState, RaidRole } from './midnight/types'
import type { CharacterEntry, CharacterInput } from '@tml/shared/types'

/** useWarbands scores characters; this page only needs names, so nothing is loaded. */
const NO_ENTRIES: CharacterEntry[] = []

export default function StrikeTeamPage() {
  const access = useMidnightAccess()
  const [sessionId] = useState(getSessionId)

  const [state, setState] = useState<MidnightState | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)

  const wb = useWarbands(NO_ENTRIES, sessionId)

  useEffect(() => {
    document.body.classList.add('body-midnight')
    return () => document.body.classList.remove('body-midnight')
  }, [])

  const reload = useCallback(async () => {
    if (!access.code) return
    const next = await fetchMidnightState().catch(() => null)
    if (next) {
      setState(next)
      setExpired(false)
    } else {
      // A stored code that stops working means the organizer rotated it.
      setExpired(true)
      clearMidnightAccess()
    }
    setLoading(false)
  }, [access.code])

  useEffect(() => {
    if (!access.code) {
      setLoading(false)
      return
    }
    setLoading(true)
    reload()
  }, [access.code, reload])

  const owned = useMemo(() => wb.warbandEntries.filter(w => w.isOwner), [wb.warbandEntries])
  const others = useMemo(() => wb.warbandEntries.filter(w => !w.isOwner), [wb.warbandEntries])
  // One player, one warband — the first owned one is the one they schedule with.
  const myWarband = owned[0] ?? null

  const warbandRefs = useMemo<WarbandRef[]>(
    () => wb.warbandEntries.map(w => ({ id: w.id, name: w.name, memberCount: w.members.length })),
    [wb.warbandEntries],
  )
  const warbandNames = useMemo(
    () => new Map(wb.warbandEntries.map(w => [w.id, w.name])),
    [wb.warbandEntries],
  )

  const report = useMemo(
    () => buildReport(state?.availability ?? [], warbandRefs),
    [state?.availability, warbandRefs],
  )

  // --- availability draft -------------------------------------------------
  const [draft, setDraft] = useState<Set<string>>(() => new Set())
  const [note, setNote] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Which warband's saved record the draft was seeded from, so a background
  // refresh never clobbers what someone is halfway through painting.
  const seededFor = useRef<string | null>(null)

  useEffect(() => {
    if (!state || !myWarband) return
    if (seededFor.current === myWarband.id) return
    const saved = state.availability.find(a => a.warbandId === myWarband.id)
    setDraft(new Set(saved?.slots ?? []))
    setNote(saved?.note ?? '')
    setDirty(false)
    seededFor.current = myWarband.id
  }, [state, myWarband])

  const handleSave = useCallback(async () => {
    if (!myWarband || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveAvailability(myWarband.id, sessionId, [...draft], note)
      if ('error' in result) {
        setSaveError(result.error)
        return
      }
      setDirty(false)
      setState(prev => prev && ({
        ...prev,
        availability: [
          ...prev.availability.filter(a => a.warbandId !== result.warbandId),
          result,
        ],
      }))
    } finally {
      setSaving(false)
    }
  }, [myWarband, saving, draft, note, sessionId])

  // --- raid slot & signups -----------------------------------------------
  const handleLock = useCallback(async (slot: RaidSlot) => {
    const result = await lockRaidSlot(slot)
    if ('error' in result) return
    // Refetch rather than assume an empty roster: signups are stored per slot
    // id, so re-locking a window used before brings its old signups back.
    await reload()
  }, [reload])

  const handleClearSlot = useCallback(async () => {
    if (await clearRaidSlot()) {
      setState(prev => prev && { ...prev, raidSlot: null, signups: [] })
    }
  }, [])

  const handleSignUp = useCallback(async (
    character: CharacterInput,
    role: RaidRole,
    signupNote: string,
  ): Promise<string | null> => {
    if (!myWarband) return 'Create a warband first'
    const result = await signUpCharacter(myWarband.id, sessionId, character, role, signupNote)
    if ('error' in result) return result.error
    setState(prev => prev && ({
      ...prev,
      signups: [...prev.signups.filter(s => s.warbandId !== result.warbandId), result],
    }))
    return null
  }, [myWarband, sessionId])

  const handleWithdraw = useCallback(async () => {
    if (!myWarband) return
    if (await withdrawSignup(myWarband.id, sessionId)) {
      setState(prev => prev && ({
        ...prev,
        signups: prev.signups.filter(s => s.warbandId !== myWarband.id),
      }))
    }
  }, [myWarband, sessionId])

  // --- render -------------------------------------------------------------
  if (!access.code) {
    return (
      <div className="app page-midnight">
        <Nav />
        <InviteGate expired={expired} />
      </div>
    )
  }

  const lockedSlot: RaidSlot | null = state?.raidSlot
    ? { day: state.raidSlot.day as Day, block: state.raidSlot.block }
    : null
  const isOrganizer = state?.role === 'organizer'

  return (
    <div className="app page-midnight">
      <Nav />

      <header className="header mn-header">
        <h1 className="mn-title">Strike Team</h1>
        <p className="subtitle">Midnight heroic progression — invite only</p>
        <p className="header-disclaimer">
          All times {TIMEZONE_LABEL}. {CANDIDATE_SLOTS.length} possible three-hour windows a week.
        </p>
        {isOrganizer && <p className="mn-organizer-tag">Organizer access</p>}
      </header>

      {loading && !state ? (
        <p className="empty">Loading the roster…</p>
      ) : (
        <div className="mn-sections">
          <section className="mn-section">
            <h2 className="mn-section-title">Your warband</h2>
            {!wb.warbandsLoaded ? (
              <p className="empty">Loading warbands…</p>
            ) : (
              <WarbandPanel
                owned={owned}
                others={others}
                onCreate={wb.addWarband}
                onAddMember={(id, member) => { wb.addMember(id, member) }}
                onRemoveMember={wb.removeMember}
                onClaim={wb.claim}
              />
            )}
          </section>

          {myWarband && (
            <section className="mn-section">
              <h2 className="mn-section-title">Your evenings</h2>
              <p className="mn-section-sub">
                Drag to paint the half hours you could raid, all times {TIMEZONE_LABEL}.
                Click a day or a time label to toggle the whole row or column.
              </p>
              <AvailabilityGrid
                selected={draft}
                onChange={next => { setDraft(next); setDirty(true) }}
                disabled={saving}
              />
              <div className="mn-save-row">
                <input
                  className="mn-note-input"
                  type="text"
                  placeholder="Note for the organizer (optional) — e.g. 'can go late on Fridays'"
                  value={note}
                  onChange={e => { setNote(e.target.value); setDirty(true) }}
                  maxLength={280}
                />
                <span className="mn-save-count">{draft.size} half hours</span>
                <button
                  className="warband-create-btn"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                >
                  {saving ? 'Saving…' : dirty ? 'Save availability' : 'Saved'}
                </button>
              </div>
              {saveError && <p className="wm-claim-error">{saveError}</p>}
            </section>
          )}

          <section className="mn-section">
            <h2 className="mn-section-title">Raid night</h2>
            <RaidSlotPanel
              raidSlot={state?.raidSlot ?? null}
              signups={state?.signups ?? []}
              warbandNames={warbandNames}
              myWarband={myWarband}
              mySlots={draft}
              isOrganizer={isOrganizer}
              onSignUp={handleSignUp}
              onWithdraw={handleWithdraw}
              onClear={handleClearSlot}
            />
          </section>

          <section className="mn-section">
            <h2 className="mn-section-title">Team availability</h2>
            <AvailabilityCalendar report={report} highlight={lockedSlot} />
          </section>

          <section className="mn-section">
            <h2 className="mn-section-title">Report</h2>
            <AvailabilityReport
              report={report}
              onLock={isOrganizer ? handleLock : undefined}
              lockedSlotId={state?.raidSlot?.id ?? null}
            />
          </section>
        </div>
      )}
    </div>
  )
}
