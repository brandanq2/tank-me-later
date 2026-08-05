import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Nav } from './components/Nav'
import { StatusPill } from './components/StatusPill'
import { fetchCommandRoom } from './api'
import type { CommandRoomData, CommandRoomPlayer } from './api'
import { classColor, effectiveCutoff, statusOf } from './titleStatus'

const REFRESH_INTERVAL = 2 * 60 * 1000

function minsAgo(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

function StreamTile({ p, parent }: { p: CommandRoomPlayer; parent: string }) {
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
        {show ? (
          <iframe
            src={src}
            title={p.stream.login}
            allowFullScreen
            allow="autoplay; fullscreen"
            loading="lazy"
          />
        ) : (
          <a
            className="cr-thumb"
            href={p.stream.url}
            target="_blank"
            rel="noreferrer"
            style={p.stream.thumbnail ? { backgroundImage: `url(${p.stream.thumbnail})` } : undefined}
          >
            <span className="cr-play">▶</span>
          </a>
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

  return (
    <div className="app page-clb">
      <Nav />

      <header className="header tw-header">
        <h1 className="tw-title">Command Room</h1>
        <p className="subtitle">Live streams within {30} points of the {cutoff.toLocaleString()} title cutoff</p>
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
          {players.map((p) => <StreamTile key={`${p.rank}-${p.stream.login}`} p={p} parent={parent} />)}
        </div>
      )}
    </div>
  )
}
