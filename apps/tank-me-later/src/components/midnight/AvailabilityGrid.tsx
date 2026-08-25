import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  BLOCKS, DAYS, DAY_SHORT, TIMEZONE_LABEL, blockEndLabel, blockLabel, cellKey,
  type Day,
} from '../../midnight/schedule'

interface Props {
  /** Cell keys this warband is available for. */
  selected: Set<string>
  onChange: (next: Set<string>) => void
  disabled?: boolean
}

/**
 * Drag-to-paint weekly evening grid. Painting mode is decided by the cell the
 * drag starts on — begin on a free cell and you're adding, begin on a marked one
 * and you're erasing — which is what every calendar picker trains people to
 * expect.
 */
export function AvailabilityGrid({ selected, onChange, disabled }: Props) {
  // Held in a ref, not state: a re-render per cell crossed would make dragging
  // across 16 rows feel sticky.
  const paintRef = useRef<'add' | 'remove' | null>(null)

  useEffect(() => {
    const stop = () => { paintRef.current = null }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  const apply = useCallback((keys: string[], mode: 'add' | 'remove') => {
    const next = new Set(selected)
    for (const key of keys) {
      if (mode === 'add') next.add(key)
      else next.delete(key)
    }
    // Skip the state churn when a drag re-crosses cells it already painted.
    if (next.size === selected.size) return
    onChange(next)
  }, [selected, onChange])

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, key: string) {
    if (disabled) return
    // Touch implicitly captures the pointer on the cell it started from, which
    // would stop pointerenter firing on every other cell of the drag.
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const mode = selected.has(key) ? 'remove' : 'add'
    paintRef.current = mode
    apply([key], mode)
  }

  function handlePointerEnter(key: string) {
    if (disabled || !paintRef.current) return
    apply([key], paintRef.current)
  }

  /** Column header toggles the whole evening — the common "I'm out Tuesdays". */
  function toggleDay(day: Day) {
    if (disabled) return
    const keys = BLOCKS.map(block => cellKey(day, block))
    const allMarked = keys.every(k => selected.has(k))
    apply(keys, allMarked ? 'remove' : 'add')
  }

  /** Row header toggles that half hour across the whole week. */
  function toggleBlock(block: number) {
    if (disabled) return
    const keys = DAYS.map(day => cellKey(day, block))
    const allMarked = keys.every(k => selected.has(k))
    apply(keys, allMarked ? 'remove' : 'add')
  }

  return (
    <div className={'mn-grid' + (disabled ? ' is-disabled' : '')}>
      <div className="mn-grid-corner">{TIMEZONE_LABEL}</div>
      {DAYS.map(day => (
        <button
          key={day}
          type="button"
          className="mn-grid-dayhead"
          onClick={() => toggleDay(day)}
          disabled={disabled}
          title={`Toggle all of ${DAY_SHORT[day]}`}
        >
          {DAY_SHORT[day]}
        </button>
      ))}

      {/* Flat children so one CSS grid owns the whole layout. */}
      {BLOCKS.flatMap(block => [
        <button
          key={`t${block}`}
          type="button"
          className="mn-grid-timehead"
          onClick={() => toggleBlock(block)}
          disabled={disabled}
          title={`Toggle ${blockLabel(block)} all week`}
        >
          {blockLabel(block)}
        </button>,
        ...DAYS.map(day => {
          const key = cellKey(day, block)
          const on = selected.has(key)
          return (
            <button
              key={key}
              type="button"
              className={'mn-cell' + (on ? ' is-on' : '')}
              aria-pressed={on}
              aria-label={`${DAY_SHORT[day]} ${blockLabel(block)} to ${blockEndLabel(block)}`}
              disabled={disabled}
              onPointerDown={e => handlePointerDown(e, key)}
              onPointerEnter={() => handlePointerEnter(key)}
              // Keyboard users get plain toggles; pointer painting never fires.
              onKeyDown={e => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                apply([key], on ? 'remove' : 'add')
              }}
            />
          )
        }),
      ])}
    </div>
  )
}
