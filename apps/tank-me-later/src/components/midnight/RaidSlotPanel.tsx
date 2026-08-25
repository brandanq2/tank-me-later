import { useEffect, useRef, useState } from 'react'
import { classColor } from '@tml/shared/titleStatus'
import type { CharacterInput, WarbandEntry } from '@tml/shared/types'
import type { RaidSlotRecord, SignupRecord } from '../../midnight/types'
import {
  CLASSES, CLASS_SPECS, RAID_ROLES, ROLE_LABELS, parseSpecValue, specValue,
} from '../../midnight/specs'
import { RAID_BLOCKS, blockFromMinutes, raidSlotCells, raidSlotLabel, type Day } from '../../midnight/schedule'
import { SpecIcon } from './SpecIcon'
import { RaidBuffs } from './RaidBuffs'
import type { CharacterLook } from '../../midnight/useCharacterLooks'
import { charKey } from '../../hooks/useWarbands'

interface Props {
  raidSlot: RaidSlotRecord | null
  signups: SignupRecord[]
  /** Warband id → display name, for signups from other players. */
  warbandNames: Map<string, string>
  /** The warband this browser signs up with — null until one exists. */
  myWarband: WarbandEntry | null
  /** This warband's own availability, to warn about signing up for a window they marked as out. */
  mySlots: Set<string>
  /** raider.io data, used only to preselect the spec someone is currently in. */
  looks: Record<string, CharacterLook>
  isOrganizer: boolean
  onSignUp: (
    character: CharacterInput,
    className: string,
    specName: string,
    note: string,
  ) => Promise<string | null>
  onWithdraw: () => Promise<void>
  onClear: () => void
}

function memberKey(m: CharacterInput): string {
  return `${m.name}-${m.realm}-${m.region}`.toLowerCase()
}

/** Tanks / Healers / Melee / Ranged, in that order, like a raid sheet. */
function SignupList({ signups, warbandNames }: {
  signups: SignupRecord[]
  warbandNames: Map<string, string>
}) {
  if (signups.length === 0) {
    return <p className="empty">Nobody has signed up yet.</p>
  }

  return (
    <div className="mn-roster">
      {RAID_ROLES.map(role => {
        const forRole = signups.filter(s => s.role === role)
        return (
          <div key={role} className="mn-roster-col">
            <h4 className="mn-roster-role">
              {ROLE_LABELS[role]}
              <span className="mn-roster-count">{forRole.length}</span>
            </h4>
            {forRole.length === 0 ? (
              <p className="mn-roster-empty">—</p>
            ) : (
              <ul className="mn-roster-list">
                {forRole.map(s => (
                  <li key={s.warbandId} className="mn-roster-entry">
                    <div className="mn-roster-headline">
                      <SpecIcon characterClass={s.className} specName={s.specName} />
                      <span
                        className="mn-roster-char"
                        style={{ color: classColor(s.className) }}
                      >{s.character.name}</span>
                    </div>
                    <span className="mn-roster-realm">
                      {s.specName} {s.className}
                    </span>
                    <span className="mn-roster-warband">
                      {warbandNames.get(s.warbandId) ?? 'Unknown warband'}
                    </span>
                    {s.note && <span className="mn-roster-note">{s.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SignupForm({ myWarband, existing, conflict, looks, onSignUp, onWithdraw }: {
  myWarband: WarbandEntry
  existing?: SignupRecord
  conflict: boolean
  looks: Record<string, CharacterLook>
  onSignUp: Props['onSignUp']
  onWithdraw: Props['onWithdraw']
}) {
  const initialChar = existing
    ? memberKey(existing.character)
    : (myWarband.members[0] ? memberKey(myWarband.members[0]) : '')

  const [selected, setSelected] = useState(initialChar)
  const [spec, setSpec] = useState(
    existing ? specValue(existing.className, existing.specName) : '',
  )
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Which character the spec box was last defaulted for, so picking a different
  // alt re-defaults the spec but an edit of an existing signup does not.
  const defaultedFor = useRef(initialChar)

  const character = myWarband.members.find(m => memberKey(m) === selected)
  const look = character ? looks[charKey(character)] : undefined
  const liveClass = look?.className

  useEffect(() => {
    const characterChanged = defaultedFor.current !== selected
    if (!characterChanged && spec) return
    if (!liveClass) return // still waiting on raider.io
    defaultedFor.current = selected
    const specs = CLASS_SPECS[liveClass] ?? []
    const pick = specs.find(s => s.name === look?.specName) ?? specs[0]
    if (pick) setSpec(specValue(liveClass, pick.name))
  }, [selected, spec, liveClass, look?.specName])

  async function handleSignUp() {
    const parsed = parseSpecValue(spec)
    if (!character || !parsed || busy) return
    setBusy(true)
    setError(null)
    try {
      setError(await onSignUp(
        { name: character.name, realm: character.realm, region: character.region },
        parsed.className,
        parsed.specName,
        note,
      ))
    } finally {
      setBusy(false)
    }
  }

  async function handleWithdraw() {
    setBusy(true)
    try { await onWithdraw() } finally { setBusy(false) }
  }

  if (myWarband.members.length === 0) {
    return (
      <p className="mn-slot-hint">
        Add a character to {myWarband.name} above, then sign up here.
      </p>
    )
  }

  return (
    <div className="mn-signup">
      <h4 className="mn-signup-title">
        {existing ? 'Your signup' : `Sign up a character from ${myWarband.name}`}
      </h4>
      {conflict && (
        <p className="mn-slot-warn">
          Heads up — you did not mark yourself available for all of this window.
          Signing up anyway is fine, just make sure you can make it.
        </p>
      )}
      <div className="mn-signup-row">
        <select value={selected} onChange={e => setSelected(e.target.value)}>
          {myWarband.members.map(m => (
            <option key={memberKey(m)} value={memberKey(m)}>
              {m.name} ({m.realm} {m.region.toUpperCase()})
            </option>
          ))}
        </select>

        {/* Whichever spec they *plan* to bring, not necessarily their current one. */}
        <select value={spec} onChange={e => setSpec(e.target.value)}>
          <option value="" disabled>Spec…</option>
          {liveClass && CLASS_SPECS[liveClass]
            ? CLASS_SPECS[liveClass].map(s => (
              <option key={s.name} value={specValue(liveClass, s.name)}>
                {s.name} {liveClass}
              </option>
            ))
            // Class unknown (raider.io slow or the character was renamed) — let
            // them pick from everything rather than blocking the signup.
            : CLASSES.map(cls => (
              <optgroup key={cls} label={cls}>
                {CLASS_SPECS[cls].map(s => (
                  <option key={s.name} value={specValue(cls, s.name)}>
                    {s.name} {cls}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>

        <input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={280}
        />
        <button
          className="warband-create-btn"
          onClick={handleSignUp}
          disabled={!selected || !spec || busy}
        >
          {busy ? 'Saving…' : existing ? 'Update' : 'Sign up'}
        </button>
      </div>
      {existing && (
        <button className="mn-link-btn mn-withdraw" onClick={handleWithdraw} disabled={busy}>
          Withdraw from this raid
        </button>
      )}
      {error && <p className="wm-claim-error">{error}</p>}
    </div>
  )
}

export function RaidSlotPanel({
  raidSlot, signups, warbandNames, myWarband, mySlots, looks, isOrganizer,
  onSignUp, onWithdraw, onClear,
}: Props) {
  if (!raidSlot) {
    return (
      <div className="mn-card mn-slot-card">
        <h3 className="mn-card-title">No raid time locked in yet</h3>
        <p className="mn-card-sub">
          {isOrganizer
            ? 'Pick a window from the report below and lock it in — signups open the moment you do.'
            : 'Fill in your availability above. Signups open once the organizer locks a three-hour window.'}
        </p>
      </div>
    )
  }

  const slot = { day: raidSlot.day as Day, block: blockFromMinutes(raidSlot.startMinutes) }
  const mySignup = myWarband ? signups.find(s => s.warbandId === myWarband.id) : undefined
  const conflict = !!myWarband && !raidSlotCells(slot).every(c => mySlots.has(c))

  return (
    <div className="mn-card mn-slot-card is-locked">
      <div className="mn-card-head">
        <h3 className="mn-card-title mn-slot-when">{raidSlotLabel(slot)}</h3>
        <span className="mn-card-meta">
          {signups.length} signed up · {RAID_BLOCKS / 2} hours
        </span>
        {isOrganizer && (
          <button className="mn-link-btn" onClick={onClear}>Clear slot</button>
        )}
      </div>

      <SignupList signups={signups} warbandNames={warbandNames} />

      {myWarband
        ? (
          <SignupForm
            // Remount when the slot or the signed-up character changes so the
            // form reflects the signup that actually exists.
            key={`${raidSlot.id}:${mySignup ? memberKey(mySignup.character) : 'none'}`}
            myWarband={myWarband}
            existing={mySignup}
            conflict={conflict}
            looks={looks}
            onSignUp={onSignUp}
            onWithdraw={onWithdraw}
          />
        )
        : <p className="mn-slot-hint">Create a warband above to sign up for this raid.</p>}

      <RaidBuffs signups={signups} />
    </div>
  )
}
