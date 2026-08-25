import { useState, type FormEvent } from 'react'
import { unlockMidnight } from '../../midnight/api'
import { storeMidnightAccess } from '../../midnight/access'

interface Props {
  /** Set when a previously-stored code stopped working. */
  expired?: boolean
}

export function InviteGate({ expired }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!code.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await unlockMidnight(code.trim())
      if ('error' in result) {
        setError(result.error)
        return
      }
      // Storing the code lights up the Strike Team nav link and unblocks the page.
      storeMidnightAccess(code.trim(), result.role)
    } catch {
      setError('Could not reach the server — try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mn-gate">
      <h2 className="mn-gate-title">Strike Team</h2>
      <p className="mn-gate-sub">
        Invite only. Enter the code you were given to see the roster and schedule.
      </p>
      {expired && (
        <p className="mn-gate-expired">
          The code saved on this browser is no longer accepted. Ask the organizer
          for the current one.
        </p>
      )}
      <form className="mn-gate-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Invite code"
          value={code}
          onChange={e => setCode(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        <button type="submit" disabled={!code.trim() || submitting}>
          {submitting ? 'Checking…' : 'Enter'}
        </button>
      </form>
      {error && <p className="mn-gate-error">{error}</p>}
    </div>
  )
}
