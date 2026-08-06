import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Nav } from './components/Nav'
import { StatusPill } from '@tml/shared/components/StatusPill'
import {
  fetchCommandRoom, fetchLivePlayer, fetchPermaWatch, addPermaWatch, removePermaWatch,
} from './api'
import type { CommandRoomData, CommandRoomPlayer, KeyRun } from './api'
import { classColor, effectiveCutoff, statusOf } from '@tml/shared/titleStatus'

const REFRESH_INTERVAL = 2 * 60 * 1000

function keyOf(c: { name: string; realm: string; region: string }) {
  return `${c.name}-${c.realm}-${c.region}`.toLowerCase()
}

function minsAgo(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

function offCutoff(margin: number): string {
  if (margin > 0) return `${margin} above cutoff`
  if (margin < 0) return `${Math.abs(margin)} below cutoff`
  return 'exactly on cutoff'
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

// Corners pushing out / pulling in — fullscreen. Box with an escaping arrow — focus view.
const D_FULLSCREEN = 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4'
const D_EXIT_FULLSCREEN = 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4'
const D_FOCUS = 'M9.5 2H14v4.5M14 2 8.5 7.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5'

/** Fullscreens the wrapper element, never the iframe — a fullscreened iframe paints alone. */
function useStageFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const [isFull, setIsFull] = useState(false)

  const toggle = useCallback(() => {
    if (document.fullscreenElement === ref.current) document.exitFullscreen()
    else ref.current?.requestFullscreen()
  }, [ref])

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])

  return { isFull, toggle }
}

/** Fades the chrome once the pointer settles. Only ever idles while `active`. */
function useIdleChrome(active: boolean, resetKey?: unknown) {
  const [idle, setIdle] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const wake = useCallback(() => {
    setIdle(false)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setIdle(true), 2000)
  }, [])

  useEffect(() => {
    wake()
    return () => window.clearTimeout(timer.current)
  }, [wake, resetKey])

  return { idle: active && idle, wake }
}

/** Live keys + score for a player, fetched only once `enabled` goes true. */
function useLiveDetail(player: CommandRoomPlayer, enabled: boolean) {
  const [keys, setKeys] = useState<KeyRun[] | null>(null)
  const [score, setScore] = useState(player.score)

  useEffect(() => {
    setKeys(null)
    setScore(player.score)
  }, [player])

  useEffect(() => {
    if (!enabled || keys !== null) return
    let alive = true
    fetchLivePlayer({ name: player.name, realm: player.realm, region: player.region }).then((d) => {
      if (!alive || !d) return
      setKeys([...d.bestRuns].sort((a, b) => b.score - a.score))
      if (d.score) setScore(d.score)
    })
    return () => { alive = false }
  }, [enabled, keys, player])

  return { keys, score }
}

interface Watchlist {
  ready: boolean
  watching: (c: CommandRoomPlayer) => boolean
  isPending: (c: CommandRoomPlayer) => boolean
  toggle: (c: CommandRoomPlayer) => void
}

/**
 * Title Watch permanent-list membership for everyone on the page. One fetch on
 * mount, then each write settles the local copy from the list the server returns.
 */
function useWatchlist(): Watchlist {
  const [keys, setKeys] = useState<Set<string> | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())
  // Read inside toggle so it doesn't have to be re-created on every change.
  const keysRef = useRef(keys)
  keysRef.current = keys

  useEffect(() => {
    let alive = true
    fetchPermaWatch().then((list) => {
      if (alive) setKeys(new Set(list.map(keyOf)))
    })
    return () => { alive = false }
  }, [])

  const toggle = useCallback(async (p: CommandRoomPlayer) => {
    const k = keyOf(p)
    if (keysRef.current === null || pending.has(k)) return
    const on = keysRef.current.has(k)
    const char = { name: p.name, realm: p.realm, region: p.region }

    setPending((s) => new Set(s).add(k))
    const list = on ? await removePermaWatch(char) : await addPermaWatch(char)
    if (list) setKeys(new Set(list.map(keyOf)))
    setPending((s) => {
      const n = new Set(s)
      n.delete(k)
      return n
    })
  }, [pending])

  return {
    ready: keys !== null,
    watching: (c) => keys?.has(keyOf(c)) ?? false,
    isPending: (c) => pending.has(keyOf(c)),
    toggle,
  }
}

/** Adds/removes this streamer from the Title Watch permanent list. */
function WatchButton({ player, watch }: { player: CommandRoomPlayer; watch: Watchlist }) {
  const on = watch.watching(player)
  const busy = watch.isPending(player)
  return (
    <button
      className={'tw-watch-btn cr-watch-btn' + (on ? ' is-on' : '')}
      disabled={busy || !watch.ready}
      onClick={(e) => {
        e.stopPropagation()
        watch.toggle(player)
      }}
      title={on ? `Remove ${player.name} from Title Watch` : `Add ${player.name} to Title Watch`}
    >
      {busy ? '…' : on ? '★ Watching' : '+ Watch'}
    </button>
  )
}

/**
 * Character readout painted over the stream. Collapses to a corner chip when the
 * chrome idles; hovering the chip brings the full card back.
 */
function StreamOverlay({ player, keys, score, collapsed, watch }: {
  player: CommandRoomPlayer
  keys: KeyRun[] | null
  score: number
  collapsed: boolean
  watch: Watchlist
}) {
  const nameColor = classColor(player.className)
  const status = statusOf(player.margin)

  return (
    <div className={'cr-ov' + (collapsed ? ' is-collapsed' : '')}>
      <div className="cr-ov-mini">
        <span className="cr-ov-mini-rank">#{player.rank}</span>
        <span className="cr-ov-mini-name" style={{ color: nameColor }}>{player.name}</span>
      </div>

      <div className="cr-ov-full">
        <div className="cr-ov-head">
          <a className="cr-name" style={{ color: nameColor }} href={player.profileUrl} target="_blank" rel="noreferrer">
            {player.name}
          </a>
          <span className="cr-realm">{player.realmName ?? player.realm}</span>
        </div>
        {player.specName && player.className && (
          <div className="cr-ov-spec">{player.specName} {player.className}</div>
        )}
        <div className="cr-ov-stats">
          <span className="cr-ov-rank">#{player.rank}</span>
          <span className="cr-ov-io">{score.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          <StatusPill status={status} margin={player.margin} />
          <WatchButton player={player} watch={watch} />
        </div>
        <div className="cr-ov-keys">
          <span className="tw-keys-label">Top keys</span>
          <div className="tw-keys"><KeyChips keys={keys} /></div>
        </div>
      </div>
    </div>
  )
}

function KeyChips({ keys }: { keys: KeyRun[] | null }) {
  if (keys === null) return <span className="tw-nokeys">loading…</span>
  if (keys.length === 0) return <span className="tw-nokeys">no keys yet</span>
  return (
    <>
      {keys.map((run) => {
        const timed = run.numUpgrades >= 1
        const cls = 'tw-key' + (timed ? ' tw-key-timed' : ' tw-key-deplete')
        const inner = (
          <>
            <span className="tw-key-level">+{run.level}</span>
            <span className="tw-key-dungeon">{run.shortName}</span>
            {timed && <span className="tw-key-up">{'★'.repeat(Math.min(3, run.numUpgrades))}</span>}
          </>
        )
        return run.url
          ? <a key={run.keystoneRunId} className={cls} href={run.url} target="_blank" rel="noreferrer" title={run.dungeon}>{inner}</a>
          : <span key={run.keystoneRunId} className={cls} title={run.dungeon}>{inner}</span>
      })}
    </>
  )
}

function FocusModal({ players, index, parent, watch, onClose, onNavigate }: {
  players: CommandRoomPlayer[]
  index: number
  parent: string
  watch: Watchlist
  onClose: () => void
  onNavigate: (delta: number) => void
}) {
  const player = players[index]
  const videoRef = useRef<HTMLDivElement>(null)
  const { isFull, toggle: toggleFullscreen } = useStageFullscreen(videoRef)
  const { idle, wake } = useIdleChrome(isFull, player)
  const { keys, score } = useLiveDetail(player, true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // In fullscreen, Escape belongs to the browser's exit gesture.
      if (e.key === 'Escape') { if (!document.fullscreenElement) onClose() }
      else if (e.key === 'ArrowLeft') onNavigate(-1)
      else if (e.key === 'ArrowRight') onNavigate(1)
      else if (e.key === 'f') toggleFullscreen()
      else if (e.key === 'w') watch.toggle(player)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, onNavigate, toggleFullscreen, watch.toggle, player])

  const nameColor = classColor(player.className)
  const status = statusOf(player.margin)
  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(player.stream.login)}&parent=${encodeURIComponent(parent)}&muted=false&autoplay=true`

  return (
    <div className="cr-focus-backdrop" onClick={onClose}>
      <div className="cr-focus" onClick={(e) => e.stopPropagation()}>
        <button className="cr-focus-close" onClick={onClose} aria-label="Close">✕</button>

        <div
          className={'cr-focus-video cr-stage' + (isFull ? ' is-full' : '') + (idle ? ' is-idle' : '')}
          ref={videoRef}
          onMouseMove={wake}
        >
          {players.length > 1 && (
            <>
              <button className="cr-nav cr-nav-prev" onClick={() => onNavigate(-1)} aria-label="Previous stream">‹</button>
              <button className="cr-nav cr-nav-next" onClick={() => onNavigate(1)} aria-label="Next stream">›</button>
            </>
          )}
          <span className="cr-focus-count">{index + 1} / {players.length}</span>
          <button
            className="cr-btn cr-fs"
            onClick={toggleFullscreen}
            title={isFull ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
            aria-label={isFull ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <Icon d={isFull ? D_EXIT_FULLSCREEN : D_FULLSCREEN} />
          </button>

          {isFull && <StreamOverlay player={player} keys={keys} score={score} collapsed={idle} watch={watch} />}

          {/* No allowFullScreen: Twitch's own button would fullscreen the iframe
              alone and drop the overlay. Ours fullscreens the wrapper instead. */}
          <iframe key={player.stream.login} src={src} title={player.stream.login} allow="autoplay" />
        </div>

        <div className="cr-focus-info">
          <div className="cr-focus-head">
            <a className="cr-name" style={{ color: nameColor }} href={player.profileUrl} target="_blank" rel="noreferrer">
              {player.name}
            </a>
            <span className="cr-realm">{player.realmName ?? player.realm}</span>
            {player.specName && player.className && <span className="cr-spec">{player.specName} {player.className}</span>}
            <StatusPill status={status} margin={player.margin} />
            <WatchButton player={player} watch={watch} />
          </div>

          <div className="cr-focus-stats">
            <span className="cr-stat"><b>#{player.rank}</b> NA rank</span>
            <span className="cr-stat"><b>{score.toLocaleString(undefined, { maximumFractionDigits: 1 })}</b> IO</span>
            <span className={'cr-stat cr-stat-off cr-stat-' + status}>{offCutoff(player.margin)}</span>
            <a className="cr-tw" href={player.stream.url} target="_blank" rel="noreferrer">
              <span className="tw-stream-dot" /> {player.stream.login} · {player.stream.viewerCount.toLocaleString()}
            </a>
          </div>

          <div className="cr-focus-keys">
            <span className="tw-keys-label">Top keys</span>
            <div className="tw-keys"><KeyChips keys={keys} /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StreamTile({ p, parent, watch, onFocus }: {
  p: CommandRoomPlayer
  parent: string
  watch: Watchlist
  onFocus: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  const { isFull, toggle: toggleFullscreen } = useStageFullscreen(videoRef)
  const { idle, wake } = useIdleChrome(isFull)
  const { keys, score } = useLiveDetail(p, isFull)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setShow(true)
        io.disconnect()
      }
    }, { rootMargin: '250px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const nameColor = classColor(p.className)
  const status = statusOf(p.margin)
  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(p.stream.login)}&parent=${encodeURIComponent(parent)}&muted=true&autoplay=false`

  return (
    <div className="cr-tile" ref={ref}>
      <div
        className={'cr-video cr-stage' + (isFull ? ' is-full' : '') + (idle ? ' is-idle' : '')}
        ref={videoRef}
        onMouseMove={wake}
      >
        <div className="cr-btns">
          {show && (
            <button
              className="cr-btn cr-fs"
              onClick={toggleFullscreen}
              title={isFull ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={isFull ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <Icon d={isFull ? D_EXIT_FULLSCREEN : D_FULLSCREEN} />
            </button>
          )}
          <button className="cr-btn cr-expand" onClick={onFocus} title="Focus view" aria-label="Open in focus view">
            <Icon d={D_FOCUS} />
          </button>
        </div>

        {isFull && <StreamOverlay player={p} keys={keys} score={score} collapsed={idle} watch={watch} />}

        {show ? (
          /* Twitch's own fullscreen would drop our overlay — see FocusModal. */
          <iframe src={src} title={p.stream.login} allow="autoplay" loading="lazy" />
        ) : (
          <button
            className="cr-thumb"
            onClick={onFocus}
            style={p.stream.thumbnail ? { backgroundImage: `url(${p.stream.thumbnail})` } : undefined}
          >
            <span className="cr-play">▶</span>
          </button>
        )}
      </div>

      <div className="cr-meta">
        <div className="cr-meta-top">
          <a className="cr-name" style={{ color: nameColor }} href={p.profileUrl} target="_blank" rel="noreferrer">
            {p.name}
          </a>
          <span className="cr-realm">{p.realmName ?? p.realm}</span>
          {p.specName && p.className && <span className="cr-spec">{p.specName} {p.className}</span>}
          <StatusPill status={status} margin={p.margin} />
          <WatchButton player={p} watch={watch} />
        </div>
        <div className="cr-meta-bot">
          <span className="cr-score">#{p.rank} · {p.score.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          <a className="cr-tw" href={p.stream.url} target="_blank" rel="noreferrer">
            <span className="tw-stream-dot" /> {p.stream.login} · {p.stream.viewerCount.toLocaleString()}
          </a>
        </div>
        {p.stream.title && <div className="cr-title" title={p.stream.title}>{p.stream.title}</div>}
      </div>
    </div>
  )
}

export default function CommandRoomPage() {
  const [data, setData] = useState<CommandRoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const parent = useMemo(() => (typeof window !== 'undefined' ? window.location.hostname : 'localhost'), [])
  const watch = useWatchlist()

  useEffect(() => {
    document.body.classList.add('body-clb')
    return () => document.body.classList.remove('body-clb')
  }, [])

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    const d = await fetchCommandRoom(refresh)
    if (d) setData(d)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(), REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [load])

  const cutoff = effectiveCutoff(data?.cutoff.score ?? 0)
  const players = data?.players ?? []

  const navigate = useCallback((delta: number) => {
    setFocusIndex((i) => {
      const n = players.length
      if (i === null || n === 0) return i
      return (i + delta + n) % n
    })
  }, [players.length])

  return (
    <div className="app page-clb">
      <Nav />

      <header className="header tw-header">
        <h1 className="tw-title">Command Room</h1>
        <p className="subtitle">Live streams within 30 points of the {cutoff.toLocaleString()} title cutoff</p>
        {data && (
          <p className="cutoff-badge">
            {data.cutoff.percentile} cutoff&nbsp;
            <span className="cutoff-score">
              {data.cutoff.score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
            &nbsp;· {players.length} live
          </p>
        )}
        {data && (
          <p className="tw-updated">
            Updated {minsAgo(data.updatedAt)}
            {' · '}
            <button className="tw-refresh" onClick={() => load(true)} disabled={refreshing}>
              {refreshing ? 'refreshing…' : 'refresh'}
            </button>
          </p>
        )}
        {players.length > 0 && (
          <p className="cr-hint">
            <b>+ Watch</b> on any stream tracks that character on <Link to="/">Title Watch</Link>
            {' · '}<kbd>w</kbd> in focus view
          </p>
        )}
      </header>

      {loading ? (
        <p className="empty">Scanning the title race for live streams…</p>
      ) : players.length === 0 ? (
        <p className="empty">No one within 30 points of title is streaming right now.</p>
      ) : (
        <div className="cr-grid">
          {players.map((p, i) => (
            <StreamTile
              key={`${p.rank}-${p.stream.login}`}
              p={p}
              parent={parent}
              watch={watch}
              onFocus={() => setFocusIndex(i)}
            />
          ))}
        </div>
      )}

      {focusIndex !== null && players[focusIndex] && (
        <FocusModal
          players={players}
          index={focusIndex}
          parent={parent}
          watch={watch}
          onNavigate={navigate}
          onClose={() => setFocusIndex(null)}
        />
      )}
    </div>
  )
}
