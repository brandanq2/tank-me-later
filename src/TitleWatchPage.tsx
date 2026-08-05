import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Nav } from './components/Nav'
import { AddCharacterForm } from './components/AddCharacterForm'
import {
  fetchTitleWatch, fetchLivePlayer, addPermaWatch, removePermaWatch,
} from './api'
import type { TitleWatchData, WatchPlayer, LivePlayerData, KeyRun } from './api'
import type { CharacterInput } from './types'

const CLASS_COLORS: Record<string, string> = {
  'Death Knight': '#C41E3A',
  'Demon Hunter': '#A330C9',
  Druid: '#FF7C0A',
  Evoker: '#33937F',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Monk: '#00FF98',
  Paladin: '#F48CBA',
  Priest: '#FFFFFF',
  Rogue: '#FFF468',
  Shaman: '#0070DD',
  Warlock: '#8788EE',
  Warrior: '#C69B3A',
}

const SAFE_MARGIN = 15    // >= this far above cutoff → safe
const DESPAIR_MARGIN = 15 // >= this far below cutoff → despair
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const FRESH_MS = 90 * 60 * 1000
const ROSTER_INTERVAL = 5 * 60 * 1000
const LIVE_INTERVAL = 60 * 1000

type Status = 'safe' | 'risk' | 'despair'

function keyOf(c: { name: string; realm: string; region: string }) {
  return `${c.name}-${c.realm}-${c.region}`.toLowerCase()
}

function statusOf(margin: number): Status {
  if (margin >= SAFE_MARGIN) return 'safe'
  if (margin <= -DESPAIR_MARGIN) return 'despair'
  return 'risk'
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

interface Gain { run: KeyRun; delta: number | null }

function KeyChip({ run, gain }: { run: KeyRun; gain?: number | null }) {
  const fresh = run.completedAt ? Date.now() - new Date(run.completedAt).getTime() < FRESH_MS : false
  const timed = run.numUpgrades >= 1
  const isGain = gain !== undefined
  const cls = 'tw-key'
    + (timed ? ' tw-key-timed' : ' tw-key-deplete')
    + (fresh ? ' tw-key-fresh' : '')
    + (isGain ? ' tw-key-gain' : '')
  const title = `${run.dungeon} · ${round1(run.score)} IO${run.completedAt ? ' · ' + timeAgo(run.completedAt) : ''}`
  const content = (
    <>
      <span className="tw-key-level">+{run.level}</span>
      <span className="tw-key-dungeon">{run.shortName}</span>
      {timed && <span className="tw-key-up">{'★'.repeat(Math.min(3, run.numUpgrades))}</span>}
      {isGain && <span className="tw-key-delta">▲{gain == null ? ' PB' : ' +' + gain}</span>}
    </>
  )
  return run.url
    ? <a className={cls} href={run.url} target="_blank" rel="noreferrer" title={title}>{content}</a>
    : <span className={cls} title={title}>{content}</span>
}

interface Row extends WatchPlayer {
  liveScore: number
  liveMargin: number
  status: Status
  bestKeys: KeyRun[]
  recentGains: Gain[]
}

export default function TitleWatchPage() {
  const [data, setData] = useState<TitleWatchData | null>(null)
  const [live, setLive] = useState<Record<string, LivePlayerData>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const playersRef = useRef<WatchPlayer[]>([])
  // Best score per dungeon captured the first time we saw each player, so we can
  // show an accurate +IO delta for keys pushed while the page is watching.
  const baselineRef = useRef<Map<string, Map<string, number>>>(new Map())

  useEffect(() => {
    document.body.classList.add('body-clb')
    return () => document.body.classList.remove('body-clb')
  }, [])

  const loadRoster = useCallback(async (refresh = false) => {
    const d = await fetchTitleWatch(refresh)
    if (d) {
      setData(d)
      playersRef.current = d.players
    }
    setLoading(false)
  }, [])

  const pollLive = useCallback(async () => {
    const players = playersRef.current
    if (players.length === 0) return
    const results = await Promise.all(
      players.map(async (p) => ({ key: keyOf(p), d: await fetchLivePlayer(p).catch(() => null) })),
    )
    for (const { key, d } of results) {
      if (d && !baselineRef.current.has(key)) {
        const m = new Map<string, number>()
        for (const r of d.bestRuns) {
          if (r.score > (m.get(r.shortName) ?? 0)) m.set(r.shortName, r.score)
        }
        baselineRef.current.set(key, m)
      }
    }
    setLive((prev) => {
      const next = { ...prev }
      for (const { key, d } of results) if (d) next[key] = d
      return next
    })
  }, [])

  // Initial + periodic roster refresh (cutoff, window, perma membership).
  useEffect(() => {
    loadRoster()
    const id = setInterval(() => loadRoster(), ROSTER_INTERVAL)
    return () => clearInterval(id)
  }, [loadRoster])

  // Live per-player score + recent keys.
  useEffect(() => {
    if (!data) return
    pollLive()
    const id = setInterval(pollLive, LIVE_INTERVAL)
    return () => clearInterval(id)
  }, [data, pollLive])

  const handleAdd = useCallback(async (char: CharacterInput) => {
    setRefreshing(true)
    await addPermaWatch(char)
    await loadRoster(true)
    setRefreshing(false)
  }, [loadRoster])

  const handleToggleWatch = useCallback(async (p: WatchPlayer) => {
    setRefreshing(true)
    if (p.perma) await removePermaWatch(p)
    else await addPermaWatch(p)
    await loadRoster(true)
    setRefreshing(false)
  }, [loadRoster])

  // Blizzard truncates the cutoff to an integer when awarding the title, so a
  // 4183.22 raw cutoff really means "4183 gets it". Use the floored value as
  // the effective threshold everywhere.
  const cutoffScore = Math.floor(data?.cutoff.score ?? 0)

  const { rows, hiddenSafe } = useMemo(() => {
    if (!data) return { rows: [] as Row[], hiddenSafe: 0 }
    let hidden = 0
    const built: Row[] = []
    for (const p of data.players) {
      const l = live[keyOf(p)]
      const liveScore = l?.score ?? p.score
      const liveMargin = Math.round((liveScore - cutoffScore) * 10) / 10
      const status = statusOf(liveMargin)
      // Perma-only players drop off once they're comfortably safe; window
      // players always stay visible. They auto-return when they fall back.
      if (p.source === 'perma' && status === 'safe') { hidden++; continue }

      const bestRuns = l?.bestRuns ?? []
      const recentRuns = l?.recentRuns ?? []
      const bestKeys = [...bestRuns].sort((a, b) => b.score - a.score)

      const isRecent = (r: KeyRun) => !!r.completedAt && Date.now() - new Date(r.completedAt).getTime() < WEEK_MS

      // Current best run per dungeon.
      const curBest = new Map<string, KeyRun>()
      for (const r of bestRuns) {
        const ex = curBest.get(r.shortName)
        if (!ex || r.score > ex.score) curBest.set(r.shortName, r)
      }

      // Recent keys that raised their IO, keyed by run id so each shows once.
      const baseline = baselineRef.current.get(keyOf(p))
      const gainsMap = new Map<number, Gain>()
      for (const [dungeon, run] of curBest) {
        const base = baseline?.get(dungeon)
        if (base !== undefined && run.score > base + 0.05) {
          // Improved for a dungeon we've been watching → exact delta.
          gainsMap.set(run.keystoneRunId, { run, delta: round1(run.score - base) })
        } else if (base === undefined && isRecent(run)) {
          // Brand-new dungeon best since we started watching.
          gainsMap.set(run.keystoneRunId, { run, delta: null })
        }
      }
      // Recent runs that are already current bests (PBs set just before we
      // started watching) — shown without a fabricated number.
      const bestIds = new Set(bestRuns.map((r) => r.keystoneRunId))
      for (const r of recentRuns) {
        if (bestIds.has(r.keystoneRunId) && isRecent(r) && !gainsMap.has(r.keystoneRunId)) {
          gainsMap.set(r.keystoneRunId, { run: r, delta: null })
        }
      }
      const recentGains = [...gainsMap.values()].sort(
        (a, b) => new Date(b.run.completedAt).getTime() - new Date(a.run.completedAt).getTime(),
      )

      built.push({ ...p, liveScore, liveMargin, status, bestKeys, recentGains })
    }
    built.sort((a, b) => b.liveScore - a.liveScore)
    return { rows: built, hiddenSafe: hidden }
  }, [data, live, cutoffScore])

  // Index of the first row at or below the cutoff (for the divider line).
  const cutoffIndex = useMemo(() => rows.findIndex((r) => r.liveMargin < 0), [rows])

  return (
    <div className="app page-clb">
      <Nav />

      <header className="header tw-header">
        <h1 className="tw-title">NA Title Watch</h1>
        <p className="subtitle">Last week of the Mythic+ 0.1% title push</p>
        {data && (
          <p className="cutoff-badge">
            {data.cutoff.percentile} cutoff&nbsp;
            <span className="cutoff-score">
              {cutoffScore.toLocaleString()}
            </span>
            &nbsp;· rank ~{data.cutoff.rank.toLocaleString()}
          </p>
        )}
        {data && (
          <p className="tw-updated">
            Updated {timeAgo(new Date(data.updatedAt).toISOString())}
            {refreshing && ' · refreshing…'}
          </p>
        )}
      </header>

      <div className="tw-controls">
        <div className="tw-addwrap">
          <span className="tw-add-label">Add to permanent watch list</span>
          <AddCharacterForm onAdd={handleAdd} loading={refreshing} />
        </div>
      </div>

      {loading ? (
        <p className="empty">Loading the title race…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No players near the cutoff right now.</p>
      ) : (
        <div className="tw-list">
          {rows.map((r, i) => {
            const classColor = r.className ? CLASS_COLORS[r.className] ?? '#aaa' : '#aaa'
            const showDivider = i === cutoffIndex && cutoffIndex > 0
            return (
              <div key={keyOf(r)}>
                {showDivider && (
                  <div className="tw-cutoff-divider">
                    <span>title cutoff · {cutoffScore.toLocaleString()}</span>
                  </div>
                )}
                <div className={`tw-row tw-row-${r.status}`}>
                  <div className="tw-rank">{r.rank ? `#${r.rank}` : '—'}</div>

                  <div className="tw-main">
                    <div className="tw-nameline">
                      <a
                        className="tw-name"
                        style={{ color: classColor }}
                        href={r.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.name}
                      </a>
                      <span className="tw-realm">{r.realmName ?? r.realm}</span>
                      {r.specName && r.className && (
                        <span className="tw-spec">{r.specName} {r.className}</span>
                      )}
                      {r.perma && (
                        <span className="tw-badge tw-badge-perma" title="On your permanent watch list">★ watching</span>
                      )}
                      <StatusPill status={r.status} margin={r.liveMargin} />
                    </div>

                    <div className="tw-keys-block">
                      <span className="tw-keys-label">Best</span>
                      <div className="tw-keys">
                        {r.bestKeys.length === 0
                          ? <span className="tw-nokeys">no keys yet</span>
                          : r.bestKeys.map((run) => <KeyChip key={run.keystoneRunId} run={run} />)}
                      </div>
                    </div>

                    {r.recentGains.length > 0 && (
                      <div className="tw-keys-block">
                        <span className="tw-keys-label tw-keys-label-gain">Recent +IO</span>
                        <div className="tw-keys">
                          {r.recentGains.map(({ run, delta }) => (
                            <KeyChip key={run.keystoneRunId} run={run} gain={delta} />
                          ))}
                        </div>
                      </div>
                    )}

                    {r.stream && (
                      <a className="tw-stream" href={r.stream.url} target="_blank" rel="noreferrer">
                        <span className="tw-stream-dot" />
                        <span className="tw-stream-name">{r.stream.login}</span>
                        <span className="tw-stream-viewers">{r.stream.viewerCount.toLocaleString()} viewers</span>
                        {r.stream.title && <span className="tw-stream-title">{r.stream.title}</span>}
                      </a>
                    )}
                  </div>

                  <div className="tw-side">
                    <div className="tw-score">
                      {r.liveScore.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </div>
                    <button className="tw-watch-btn" onClick={() => handleToggleWatch(r)} disabled={refreshing}>
                      {r.perma ? 'Unwatch' : 'Watch'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {hiddenSafe > 0 && (
            <p className="tw-hidden-note">
              {hiddenSafe} watched {hiddenSafe === 1 ? 'player is' : 'players are'} currently safe
              ({SAFE_MARGIN}+ above cutoff) and hidden. They'll reappear if they fall back into range.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_META: Record<Status, { label: string; icon: string }> = {
  safe: { label: 'SAFE', icon: '🛡️' },
  risk: { label: 'AT RISK', icon: '⚠️' },
  despair: { label: 'DESPAIR', icon: '💀' },
}

function StatusPill({ status, margin }: { status: Status; margin: number }) {
  const { label, icon } = STATUS_META[status]
  const sign = margin >= 0 ? '+' : ''
  return (
    <span className={`tw-pill tw-pill-${status}`}>
      <span className="tw-pill-icon" aria-hidden>{icon}</span>
      {label}<span className="tw-pill-margin">{sign}{margin}</span>
    </span>
  )
}
