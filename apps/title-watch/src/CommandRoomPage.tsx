import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Nav } from './components/Nav'
import { StatusPill } from '@tml/shared/components/StatusPill'
import {
  fetchCommandRoom, fetchLivePlayer, fetchPermaWatch, addPermaWatch, removePermaWatch,
  ROOM_WINDOW_PRESETS, ROOM_WINDOW_DEFAULT,
} from './api'
import type { CommandRoomData, CommandRoomPlayer, KeyRun } from './api'
import { classColor, effectiveCutoff, statusOf } from '@tml/shared/titleStatus'

const REFRESH_INTERVAL = 2 * 60 * 1000
const WINDOW_STORAGE_KEY = 'tml:command-room:window'
/** Panes the grid can hold. Four 16:9 streams tile a 16:9 stage exactly. */
const MAX_MULTI = 4

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

function storedWindow(): number {
  try {
    const saved = Number(localStorage.getItem(WINDOW_STORAGE_KEY))
    if (ROOM_WINDOW_PRESETS.includes(saved)) return saved
  } catch { /* private mode — fall through to the default */ }
  return ROOM_WINDOW_DEFAULT
}

/**
 * A wider band contains every player in a narrower one, so tightening the window
 * is a local filter — no second sweep of raider.io.
 */
function narrowBand(d: CommandRoomData, pts: number): CommandRoomData {
  if (d.window <= pts) return d
  return { ...d, window: pts, players: d.players.filter((p) => Math.abs(p.margin) <= pts) }
}

/**
 * How far either side of the cutoff to sweep raider.io for live streams. Clicks
 * stay live while a band loads — a later pick simply wins the race.
 */
function WindowPicker({ pts, loadingBand, onChange }: {
  pts: number
  loadingBand: boolean
  onChange: (pts: number) => void
}) {
  return (
    <div className="cr-window">
      <span className="cr-window-label">IO window</span>
      {ROOM_WINDOW_PRESETS.map((n) => (
        <button
          key={n}
          className={'cr-window-btn' + (n === pts ? ' is-on' : '') + (n === pts && loadingBand ? ' is-loading' : '')}
          onClick={() => onChange(n)}
          aria-pressed={n === pts}
          title={`Streams within ${n} points of the cutoff`}
        >
          ±{n}
        </button>
      ))}
    </div>
  )
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
// Four panes — add to the grid, and collapse a solo pane back into it.
const D_GRID = 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z'
const D_AUDIO_ON = 'M2.5 6h2L8 3.5v9L4.5 10h-2zM10.6 6.2a2.6 2.6 0 0 1 0 3.6M12.6 4.4a5.2 5.2 0 0 1 0 7.2'
const D_AUDIO_OFF = 'M2.5 6h2L8 3.5v9L4.5 10h-2zM10.8 6.2l3.4 3.6M14.2 6.2l-3.4 3.6'
const D_KEY = 'M6.6 5.3a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 1 0 0-5.2M9.2 7.9H14M12.4 7.9v2.3M10.7 7.9v1.7'

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

// ── Multi-stream grid ───────────────────────────────────────────────────────
// The grid uses Twitch's player *script* rather than a bare iframe: moving audio
// between panes has to be a `setMuted` call, since re-writing an iframe's src
// would restart the stream every time you switch who you're listening to.
interface TwitchPlayerApi {
  setMuted(muted: boolean): void
  addEventListener?(event: string, cb: () => void): void
}

type TwitchPlayerCtor = (new (el: HTMLElement, opts: Record<string, unknown>) => TwitchPlayerApi)
  & { READY?: string }

declare global {
  interface Window {
    Twitch?: { Player: TwitchPlayerCtor }
  }
}

const TWITCH_PLAYER_SCRIPT = 'https://player.twitch.tv/js/embed/v1.js'
let playerScript: Promise<void> | null = null

function loadTwitchPlayer(): Promise<void> {
  if (window.Twitch?.Player) return Promise.resolve()
  playerScript ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = TWITCH_PLAYER_SCRIPT
    el.async = true
    el.onload = () => (window.Twitch?.Player ? resolve() : reject(new Error('no Twitch.Player')))
    el.onerror = () => reject(new Error('twitch player script blocked'))
    document.head.appendChild(el)
  })
  return playerScript
}

/**
 * One pane of the grid. Mounts muted — browsers refuse unmuted autoplay — then
 * unmutes through the API if this is the pane the user is listening to.
 */
function MultiPane({ p, parent, index, audio, solo, showKeys, watch, onAudio, onSolo, onRemove }: {
  p: CommandRoomPlayer
  parent: string
  index: number
  audio: boolean
  solo: boolean
  showKeys: boolean
  watch: Watchlist
  onAudio: () => void
  onSolo: () => void
  onRemove: () => void
}) {
  const mount = useRef<HTMLDivElement>(null)
  const api = useRef<TwitchPlayerApi | null>(null)
  const [blocked, setBlocked] = useState(false)
  // Only costs a raider.io profile call while the key rows are actually up.
  const { keys, score } = useLiveDetail(p, showKeys)
  // The script may still be loading when the audio pane is decided, so the
  // player reads the latest value on creation instead of missing the first set.
  const audioRef = useRef(audio)
  audioRef.current = audio

  useEffect(() => {
    let dead = false
    const el = mount.current
    loadTwitchPlayer().then(() => {
      if (dead || !el || !window.Twitch) return
      const Player = window.Twitch.Player
      const pl = new Player(el, {
        channel: p.stream.login,
        parent: [parent],
        width: '100%',
        height: '100%',
        // Always start muted: a browser will refuse unmuted autoplay outright,
        // where muted-then-unmuted plays. The real state lands on ready.
        muted: true,
        autoplay: true,
        // Twitch's own fullscreen would take the pane's iframe alone and lose the
        // rest of the grid; expand and stage fullscreen replace it.
        allowfullscreen: false,
      })
      api.current = pl
      pl.addEventListener?.(Player.READY ?? 'ready', () => pl.setMuted(!audioRef.current))
    }).catch(() => { if (!dead) setBlocked(true) })

    return () => {
      dead = true
      api.current = null
      if (el) el.innerHTML = '' // React never owns this subtree — Twitch does
    }
  }, [p.stream.login, parent])

  useEffect(() => {
    api.current?.setMuted(!audio)
  }, [audio])

  const nameColor = classColor(p.className)

  return (
    <div className={'cr-mv-pane' + (solo ? ' is-solo' : '') + (audio ? ' is-audio' : '')}>
      {/* Fallback for a blocked script: a plain iframe, where switching audio
          does cost a reload. */}
      {blocked
        ? <iframe
            src={`https://player.twitch.tv/?channel=${encodeURIComponent(p.stream.login)}&parent=${encodeURIComponent(parent)}&muted=${!audio}&autoplay=true`}
            title={p.stream.login}
            allow="autoplay"
          />
        : <div className="cr-mv-mount" ref={mount} />}

      <div className="cr-mv-pane-btns">
        <button
          className={'cr-btn' + (audio ? ' is-on' : '')}
          onClick={onAudio}
          title={audio ? 'Listening to this stream' : `Listen to ${p.stream.login}`}
          aria-label={audio ? 'Listening' : 'Listen to this stream'}
        >
          <Icon d={audio ? D_AUDIO_ON : D_AUDIO_OFF} />
        </button>
        <button
          className="cr-btn"
          onClick={onSolo}
          title={solo ? `Back to grid (${index + 1})` : `Expand (${index + 1})`}
          aria-label={solo ? 'Back to grid' : 'Expand this stream'}
        >
          <Icon d={solo ? D_GRID : D_FULLSCREEN} />
        </button>
        <button className="cr-btn" onClick={onRemove} title="Remove from grid" aria-label="Remove from grid">✕</button>
      </div>

      <div className="cr-mv-info">
        <div className="cr-mv-info-top">
          <span className="cr-mv-slot">{index + 1}</span>
          <a className="cr-name" style={{ color: nameColor }} href={p.profileUrl} target="_blank" rel="noreferrer">
            {p.name}
          </a>
          <span className="cr-mv-score">#{p.rank} · {score.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          <StatusPill status={statusOf(p.margin)} margin={p.margin} />
          <WatchButton player={p} watch={watch} />
        </div>
        {showKeys && (
          <div className="cr-mv-keys">
            <span className="tw-keys-label">Top keys</span>
            <div className="tw-keys"><KeyChips keys={keys} /></div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Up to four streams at once. Expanding a pane hides its neighbours rather than
 * unmounting them, so collapsing back to the grid never re-buffers a stream.
 */
function MultiView({ players, parent, watch, onRemove, onClose }: {
  players: CommandRoomPlayer[]
  parent: string
  watch: Watchlist
  onRemove: (login: string) => void
  onClose: () => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const { isFull, toggle: toggleFullscreen } = useStageFullscreen(stageRef)
  const { idle, wake } = useIdleChrome(isFull)
  const [audio, setAudio] = useState(() => players[0]?.stream.login ?? '')
  const [solo, setSolo] = useState<string | null>(null)
  const [showKeys, setShowKeys] = useState(true)

  // Expanding a pane also moves audio to it — watching one stream while hearing
  // another is never what the click meant.
  const expand = useCallback((login: string) => {
    setSolo((cur) => (cur === login ? null : login))
    setAudio(login)
  }, [])

  // Open straight into real fullscreen — the click that got us here is the user
  // activation that permits it. Exiting drops to the windowed grid, not out.
  useEffect(() => {
    stageRef.current?.requestFullscreen?.().catch(() => { /* denied — f still works */ })
  }, [])

  // Keep the pointers valid as panes leave (removed, or dropped by a refresh).
  useEffect(() => {
    const live = new Set(players.map((p) => p.stream.login))
    if (solo && !live.has(solo)) setSolo(null)
    if (!live.has(audio)) setAudio(players[0]?.stream.login ?? '')
  }, [players, solo, audio])

  const active = solo ?? audio

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Collapse first; past that, Escape belongs to the browser in fullscreen.
        if (solo) setSolo(null)
        else if (!document.fullscreenElement) onClose()
      } else if (e.key >= '1' && e.key <= String(MAX_MULTI)) {
        const p = players[Number(e.key) - 1]
        if (p) expand(p.stream.login)
      } else if (e.key === 'f') toggleFullscreen()
      else if (e.key === 'k') setShowKeys((v) => !v)
      else if (e.key === 'w') {
        const p = players.find((x) => x.stream.login === active)
        if (p) watch.toggle(p)
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [players, solo, active, expand, onClose, toggleFullscreen, watch.toggle])

  const count = Math.min(players.length, MAX_MULTI)

  return (
    <div className="cr-mv-backdrop">
      <div
        className={'cr-mv-stage cr-stage'
          + ` cr-mv-n${count}`
          // Two side-by-side 16:9 panes make a 32:9 stage; soloing one puts it back to 16:9.
          + (count === 2 && !solo ? ' is-wide' : '')
          + (solo ? ' is-soloing' : '')
          + (isFull ? ' is-full' : '')
          + (idle ? ' is-idle' : '')}
        ref={stageRef}
        onMouseMove={wake}
      >
        <div className="cr-mv-grid">
          {players.slice(0, MAX_MULTI).map((p, i) => (
            <MultiPane
              key={p.stream.login}
              p={p}
              parent={parent}
              index={i}
              audio={p.stream.login === audio}
              solo={p.stream.login === solo}
              showKeys={showKeys}
              watch={watch}
              onAudio={() => setAudio(p.stream.login)}
              onSolo={() => expand(p.stream.login)}
              onRemove={() => onRemove(p.stream.login)}
            />
          ))}
        </div>

        <div className="cr-mv-ctl">
          <button
            className={'cr-btn' + (showKeys ? ' is-on' : '')}
            onClick={() => setShowKeys((v) => !v)}
            title={showKeys ? 'Hide key overlays (k)' : 'Show key overlays (k)'}
            aria-label={showKeys ? 'Hide key overlays' : 'Show key overlays'}
            aria-pressed={showKeys}
          >
            <Icon d={D_KEY} />
          </button>
          <button
            className="cr-btn"
            onClick={toggleFullscreen}
            title={isFull ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
            aria-label={isFull ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <Icon d={isFull ? D_EXIT_FULLSCREEN : D_FULLSCREEN} />
          </button>
          <button className="cr-btn" onClick={onClose} title="Close grid (Esc)" aria-label="Close grid">✕</button>
        </div>

        <p className="cr-mv-hint">
          {count > 1 && <><kbd>1</kbd>–<kbd>{count}</kbd> expand · </>}
          <kbd>Esc</kbd> back · <kbd>f</kbd> fullscreen · <kbd>k</kbd> keys · <kbd>w</kbd> watch
        </p>
      </div>
    </div>
  )
}

/** Puts this stream in (or out of) the multi-stream grid. */
function GridButton({ slot, full, onToggle }: { slot: number; full: boolean; onToggle: () => void }) {
  const on = slot > 0
  return (
    <button
      className={'cr-btn cr-grid-btn' + (on ? ' is-on' : '')}
      onClick={onToggle}
      disabled={!on && full}
      aria-pressed={on}
      title={on ? `Pane ${slot} — click to remove from grid` : full ? `Grid is full (${MAX_MULTI} streams)` : 'Add to grid'}
    >
      {on ? <span className="cr-grid-slot">{slot}</span> : <Icon d={D_GRID} />}
    </button>
  )
}

function StreamTile({ p, parent, watch, slot, gridFull, onToggleGrid, onFocus }: {
  p: CommandRoomPlayer
  parent: string
  watch: Watchlist
  slot: number
  gridFull: boolean
  onToggleGrid: () => void
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
          <GridButton slot={slot} full={gridFull} onToggle={onToggleGrid} />
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

/** The selected streams, with a button to open them as a grid. */
function MultiBar({ picks, onOpen, onClear }: {
  picks: CommandRoomPlayer[]
  onOpen: () => void
  onClear: () => void
}) {
  return (
    <div className="cr-mv-bar">
      <span className="cr-mv-bar-count">{picks.length}/{MAX_MULTI}</span>
      <span className="cr-mv-bar-names">
        {picks.map((p) => (
          <span key={p.stream.login} className="cr-mv-bar-name" style={{ color: classColor(p.className) }}>
            {p.name}
          </span>
        ))}
      </span>
      <button className="cr-mv-bar-open" onClick={onOpen}>
        <Icon d={D_GRID} /> Watch {picks.length > 1 ? `${picks.length} streams` : 'stream'}
      </button>
      <button className="cr-mv-bar-clear" onClick={onClear}>Clear</button>
    </div>
  )
}

export default function CommandRoomPage() {
  const [pts, setPts] = useState(storedWindow)
  const [data, setData] = useState<CommandRoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  // Stream logins in pick order — the grid's slot numbers come straight from it.
  const [picked, setPicked] = useState<string[]>([])
  const [gridOpen, setGridOpen] = useState(false)
  const parent = useMemo(() => (typeof window !== 'undefined' ? window.location.hostname : 'localhost'), [])
  const watch = useWatchlist()
  // Every band we've fetched this session, keyed by its width, so flipping back
  // to one already on hand paints instantly.
  const bands = useRef(new Map<number, CommandRoomData>())
  // Only the newest request may write state — bands can land out of order.
  const reqId = useRef(0)

  useEffect(() => {
    document.body.classList.add('body-clb')
    return () => document.body.classList.remove('body-clb')
  }, [])

  const load = useCallback(async (target: number, { local = false, refresh = false } = {}) => {
    // Paint from the tightest band we hold that covers the request, so tightening
    // the window is instant; only go back to raider.io if that band has aged out.
    const covering = local
      ? [...bands.current.values()].filter((d) => d.window >= target).sort((a, b) => a.window - b.window)[0]
      : undefined
    if (covering) {
      setData(narrowBand(covering, target))
      setLoading(false)
      if (Date.now() - covering.updatedAt < REFRESH_INTERVAL) return
    }

    const id = ++reqId.current
    setRefreshing(true)
    const d = await fetchCommandRoom(target, refresh)
    if (reqId.current !== id) return // a newer band is already in flight
    if (d) {
      bands.current.set(d.window, d)
      setData(d)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load(pts, { local: true })
    const id = setInterval(() => load(pts), REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [load, pts])

  const changeWindow = useCallback((n: number) => {
    setPts(n)
    setFocusIndex(null) // the list is about to change under it
    try { localStorage.setItem(WINDOW_STORAGE_KEY, String(n)) } catch { /* not worth failing over */ }
  }, [])

  const cutoff = effectiveCutoff(data?.cutoff.score ?? 0)
  const players = data?.players ?? []
  // The band on screen, which trails `pts` while a wider sweep is in flight.
  const shownWindow = data?.window ?? pts

  const navigate = useCallback((delta: number) => {
    setFocusIndex((i) => {
      const n = players.length
      if (i === null || n === 0) return i
      return (i + delta + n) % n
    })
  }, [players.length])

  // Picks survive refreshes by login, but not a streamer going offline or
  // dropping out of the band — drop those so the slot frees up.
  useEffect(() => {
    setPicked((cur) => {
      const live = cur.filter((login) => players.some((p) => p.stream.login === login))
      return live.length === cur.length ? cur : live
    })
  }, [players])

  const togglePick = useCallback((login: string) => {
    setPicked((cur) => (cur.includes(login)
      ? cur.filter((l) => l !== login)
      : cur.length >= MAX_MULTI ? cur : [...cur, login]))
  }, [])

  const picks = useMemo(
    () => picked.map((login) => players.find((p) => p.stream.login === login)).filter(Boolean) as CommandRoomPlayer[],
    [picked, players],
  )

  // Nothing left to show means nothing left to keep open.
  useEffect(() => {
    if (gridOpen && picks.length === 0) setGridOpen(false)
  }, [gridOpen, picks.length])

  return (
    <div className="app page-clb">
      <Nav />

      <header className="header tw-header">
        <h1 className="tw-title">Command Room</h1>
        <p className="subtitle">
          Live streams within {shownWindow} points of the {cutoff.toLocaleString()} title cutoff
        </p>
        <WindowPicker pts={pts} loadingBand={refreshing && shownWindow !== pts} onChange={changeWindow} />
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
            <button className="tw-refresh" onClick={() => load(pts, { refresh: true })} disabled={refreshing}>
              {refreshing ? 'refreshing…' : 'refresh'}
            </button>
          </p>
        )}
        {players.length > 0 && (
          <p className="cr-hint">
            <b>+ Watch</b> on any stream tracks that character on <Link to="/">Title Watch</Link>
            {' · '}<kbd>w</kbd> in focus view
            {' · '}the <b>grid</b> button stacks up to {MAX_MULTI} streams side by side
          </p>
        )}
      </header>

      {loading ? (
        <p className="empty">Scanning the title race for live streams…</p>
      ) : players.length === 0 ? (
        <p className="empty">
          No one within {shownWindow} points of title is streaming right now.
          {shownWindow < (ROOM_WINDOW_PRESETS[ROOM_WINDOW_PRESETS.length - 1] ?? shownWindow)
            && ' Try a wider IO window.'}
        </p>
      ) : (
        <div className={'cr-grid' + (picks.length > 0 ? ' has-bar' : '')}>
          {players.map((p, i) => (
            <StreamTile
              key={`${p.rank}-${p.stream.login}`}
              p={p}
              parent={parent}
              watch={watch}
              slot={picked.indexOf(p.stream.login) + 1}
              gridFull={picked.length >= MAX_MULTI}
              onToggleGrid={() => togglePick(p.stream.login)}
              onFocus={() => setFocusIndex(i)}
            />
          ))}
        </div>
      )}

      {picks.length > 0 && !gridOpen && (
        <MultiBar
          picks={picks}
          onOpen={() => {
            setFocusIndex(null) // one player at a time
            setGridOpen(true)
          }}
          onClear={() => setPicked([])}
        />
      )}

      {gridOpen && picks.length > 0 && (
        <MultiView
          players={picks}
          parent={parent}
          watch={watch}
          onRemove={togglePick}
          onClose={() => setGridOpen(false)}
        />
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
