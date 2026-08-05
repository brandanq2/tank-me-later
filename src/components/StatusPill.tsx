import { STATUS_META } from '../titleStatus'
import type { Status } from '../titleStatus'

export function StatusPill({ status, margin }: { status: Status; margin: number }) {
  const { label, icon } = STATUS_META[status]
  const sign = margin >= 0 ? '+' : ''
  return (
    <span className={`tw-pill tw-pill-${status}`}>
      <span className="tw-pill-icon" aria-hidden>{icon}</span>
      {label}<span className="tw-pill-margin">{sign}{margin}</span>
    </span>
  )
}
