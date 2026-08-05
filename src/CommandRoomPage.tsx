import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Nav } from './components/Nav'
import { StatusPill } from './components/StatusPill'
import { fetchCommandRoom, fetchLivePlayer } from './api'
import type { CommandRoomData, CommandRoomPlayer, KeyRun } from './api'
import { classColor, effectiveCutoff, statusOf } from './titleStatus'

const REFRESH_INTERVAL = 2 * 60 * 1000

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

function FocusModal({ players, index, parent, onClose, onNavigate }: {
  players: CommandRoomPlayer[]
  index: number
  parent: string
  onClose: () => void
  onNavigate: (delta: number) => void
}) {
  const player = players[index]
  const [keys, setKeys] = useState<KeyRun[] | null>(null)
  const [liveScore, setLiveScore] = useState(player.score)

  useEffect(() => {
    let alive = true
    setKeys(null)
    setLiveScore(player.score)
    fetchLivePlayer({ name: player.name, realm: player.realm, region: player.region }).then((d) => {
      if (!alive || !d) return
      setKeys([...d.bestRuns].sort((a, b) => b.score - a.score))
      if (d.score) setLiveScore(d.score)
    })
    return () => { alive = false }
  }, [player])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onNavigate(-1)
      else if (e.key === 'ArrowRight') onNavigate(1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, onNavigate])

  const nameColor = classColor(player.className)
  const status = statusOf(player.margin)
  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(player.stream.login)}&parent=${encodeURIComponent(parent)}&muted=false&autoplay=true`

  return (
    <div className="cr-focus-backdrop" onClick={onClose}>
      <div className="cr-focus" onClick={(e) => e.stopPropagation()}>
        <button className="cr-focus-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="cr-focus-video">
          {players.length > 1 && (
            <>
              <button className="cr-nav cr-nav-prev" onClick={() => onNavigate(-1)} aria-label="Previous stream">‹</button>
              <button className="cr-nav cr-nav-next" onClick={() => onNavigate(1)} aria-label="Next stream">›</button>
            </>
          )}
          <span className="cr-focus-count">{index + 1} / {players.length}</span>
          <iframe src={src} title={player.stream.login} allow="autoplay; fullscreen" allowFullScreen />
        </div>

        <div className="cr-focus-info">
          <div className="cr-focus-head">
            <a className="cr-name" style={{ color: nameColor }} href={player.profileUrl} target="_blank" rel="noreferrer">
              {player.name}
            </a>
            <span className="cr-realm">{player.realmName ?? player.realm}</span>
            {player.specName && player.className && <span className="cr-spec">{player.specName} {player.className}</span>}
            <StatusPill status={status} margin={player.margin} />
          </div>

          <div className="cr-focus-stats">
            <span className="cr-stat"><b>#{player.rank}</b> NA rank</span>
            <span className="cr-stat"><b>{liveScore.toLocaleString(undefined, { maximumFractionDigits: 1 })}</b> IO</span>
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

function StreamTile({ p, parent, onFocus }: { p: CommandRoomPlayer; parent: string; onFocus: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)

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
      <div className="cr-video">
        <button className="cr-expand" onClick={onFocus} title="Expand" aria-label="Expand stream">⤢</button>
        {show ? (
          <iframe src={src} title={p.stream.login} allow="autoplay; fullscreen" allowFullScreen loading="lazy" />
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
            <button className="cr-refresh" onClick={() => load(true)} disabled={refreshing}>
              {refreshing ? 'refreshing…' : 'refresh'}
            </button>
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
            <StreamTile key={`${p.rank}-${p.stream.login}`} p={p} parent={parent} onFocus={() => setFocusIndex(i)} />
          ))}
        </div>
      )}

      {focusIndex !== null && players[focusIndex] && (
        <FocusModal
          players={players}
          index={focusIndex}
          parent={parent}
          onNavigate={navigate}
          onClose={() => setFocusIndex(null)}
        />
      )}
    </div>
  )
}
