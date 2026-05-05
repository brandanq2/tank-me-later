import { useEffect, useMemo, useState } from 'react'
import { useLeaderboard, revealDelay } from './hooks/useLeaderboard'
import { useWarbands } from './hooks/useWarbands'
import { AddCharacterForm } from './components/AddCharacterForm'
import { LeaderboardRow } from './components/LeaderboardRow'
import { WarbandCard } from './components/WarbandCard'
import { WarbandManager } from './components/WarbandManager'
import { VoteModal } from './components/VoteModal'
import { Nav } from './components/Nav'
import { SoloQueueTiers } from './components/SoloQueueTiers'
import { useFlag } from './hooks/useFlags'
import { fetchSoloQueueMapping } from './api'
import type { RankCutoff } from './solo-queue'
import type { CharacterEntry, WarbandEntry } from './types'

type CombinedItem =
  | { kind: 'char'; entry: CharacterEntry }
  | { kind: 'warband'; entry: WarbandEntry }

export default function OpenLeaderboardPage() {
  const soloQueueEnabled = useFlag('solo-queue')
  const votingEnabled = useFlag('vote-to-kick')
  const warbandsEnabled = useFlag('warbands')
  const [soloMapping, setSoloMapping] = useState<RankCutoff[]>([])

  useEffect(() => {
    if (soloQueueEnabled) fetchSoloQueueMapping().then(setSoloMapping)
  }, [soloQueueEnabled])

  const lb = useLeaderboard({
    listId: 'open',
    ownedStorageKey: 'tank-me-later:owned:open',
    initialCharacters: [],
    scoreField: 'all',
  })

  const wb = useWarbands(lb.entries, lb.sessionId)

  const dungeonOrder = useMemo(() => {
    const names = new Set<string>()
    for (const entry of lb.entries) {
      for (const run of entry.bestRuns ?? []) names.add(run.shortName)
    }
    if (warbandsEnabled) {
      for (const entry of wb.warbandEntries) {
        for (const run of entry.topRuns) names.add(run.shortName)
      }
    }
    return Array.from(names).sort()
  }, [lb.entries, wb.warbandEntries, warbandsEnabled])

  // Combined sorted leaderboard: individual entries (excluding warband members) + warband cards
  const combined = useMemo((): Array<CombinedItem & { rank: number }> => {
    const items: CombinedItem[] = []

    for (const entry of lb.leaderboard) {
      const key = `${entry.name}-${entry.realm}-${entry.region}`.toLowerCase()
      if (warbandsEnabled && wb.warbandMemberKeys.has(key)) continue
      items.push({ kind: 'char', entry })
    }

    if (warbandsEnabled) {
      for (const entry of wb.warbandEntries) {
        items.push({ kind: 'warband', entry })
      }
    }

    const scored = items.sort((a, b) => {
      const aScore = a.kind === 'char'
        ? (a.entry.status === 'success' ? (a.entry.score ?? 0) : -1)
        : a.entry.score
      const bScore = b.kind === 'char'
        ? (b.entry.status === 'success' ? (b.entry.score ?? 0) : -1)
        : b.entry.score
      return bScore - aScore
    })

    return scored.map((item, i) => ({ ...item, rank: i + 1 }))
  }, [lb.leaderboard, wb.warbandEntries, wb.warbandMemberKeys, warbandsEnabled])

  // Clowns: 0-IO individual entries not in a warband
  const clowns = useMemo(() => lb.clowns.filter(e => {
    if (!warbandsEnabled) return true
    const key = `${e.name}-${e.realm}-${e.region}`.toLowerCase()
    return !wb.warbandMemberKeys.has(key)
  }), [lb.clowns, wb.warbandMemberKeys, warbandsEnabled])

  return (
    <div className="app">
      <Nav />

      <header className="header clb-header">
        <img src="/CLB-header.png" className="clb-header-img" alt="" aria-hidden />
        <div className="clb-subheader">
          <div className="clb-title-row">
            <span className="clb-title">Certified Leader Board</span>
            <div className="clb-swatches">
              <span className="clb-swatch" style={{ background: '#5B8EC4' }} />
              <span className="clb-swatch" style={{ background: '#9B7DC0' }} />
              <span className="clb-swatch" style={{ background: '#C49460' }} />
              <span className="clb-swatch" style={{ background: '#8B9B4C' }} />
              <span className="clb-swatch" style={{ background: '#D44090' }} />
            </div>
          </div>
          <span className="clb-sub">BTW</span>
        </div>
        {lb.cutoff && (
          <p className="cutoff-badge">
            {lb.cutoff.percentile} cutoff&nbsp;
            <span className="cutoff-score">
              {lb.cutoff.score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          </p>
        )}
      </header>

      <div className="content-layout">
        <div className="content-main">
          <div className="controls">
            <AddCharacterForm onAdd={(input) => lb.addCharacter(input, true)} loading={lb.anyLoading} />
            {lb.entries.length > 0 && (
              <button className="refresh-btn" onClick={lb.refreshAll} disabled={lb.anyLoading}>
                Refresh All
              </button>
            )}
            {warbandsEnabled && (
              <WarbandManager
                onCreate={wb.addWarband}
                onAddCharacter={(input) => lb.addCharacter(input, true)}
              />
            )}
          </div>

          {lb.entries.length === 0 && (!warbandsEnabled || wb.warbandEntries.length === 0) ? (
            <p className="empty">Add characters above to build your leaderboard.</p>
          ) : (
            <div className={lb.revealed && !lb.isRefreshing ? undefined : 'pre-reveal'}>
              <div className="leaderboard">
                {combined.map((item) => {
                  if (item.kind === 'warband') {
                    return (
                      <WarbandCard
                        key={`warband-${item.entry.id}`}
                        entry={item.entry}
                        rank={item.rank}
                        sessionId={lb.sessionId}
                        cutoffScore={lb.cutoffScore}
                        soloMapping={soloQueueEnabled ? soloMapping : undefined}
                        revealed={lb.revealed}
                        isInitialEntry={lb.revealed}
                        revealDelay={revealDelay(item.rank)}
                        onRemoveMember={wb.removeMember}
                        onRemoveWarband={wb.removeWarband}
                        dungeonOrder={dungeonOrder}
                      />
                    )
                  }

                  const entry = item.entry
                  const charKey = `${entry.name}-${entry.realm}-${entry.region}`.toLowerCase()
                  const activeVote = lb.votes.find(v => v.charKey === charKey)
                  return (
                    <LeaderboardRow
                      key={entry.id}
                      entry={entry}
                      rank={item.rank}
                      rankDelta={entry.prevRank != null ? entry.prevRank - item.rank : undefined}
                      activeVote={activeVote}
                      sessionId={lb.sessionId}
                      cutoffScore={lb.cutoffScore}
                      revealed={lb.revealed}
                      isInitialEntry={lb.initialIds.has(entry.id)}
                      revealDelay={revealDelay(item.rank)}
                      onRemove={lb.handleRemoveOrVote}
                      soloMapping={soloQueueEnabled ? soloMapping : undefined}
                      votingEnabled={votingEnabled}
                      showClassLabel
                      scoreLabel=""
                      dungeonOrder={dungeonOrder}
                    />
                  )
                })}
              </div>

              {clowns.length > 0 && (
                <div className="clown-section">
                  <h2 className="clown-title">🤡 Clown List</h2>
                  <p className="clown-subtitle">0 IO this season</p>
                  <div className="leaderboard">
                    {clowns.map((entry) => {
                      const charKey = `${entry.name}-${entry.realm}-${entry.region}`.toLowerCase()
                      const activeVote = lb.votes.find(v => v.charKey === charKey)
                      return (
                        <LeaderboardRow
                          key={entry.id}
                          entry={entry}
                          rank={0}
                          activeVote={activeVote}
                          sessionId={lb.sessionId}
                          cutoffScore={lb.cutoffScore}
                          revealed={lb.revealed}
                          isInitialEntry={lb.initialIds.has(entry.id)}
                          revealDelay={revealDelay(combined.length + 1)}
                          onRemove={lb.handleRemoveOrVote}
                          soloMapping={soloQueueEnabled ? soloMapping : undefined}
                          votingEnabled={votingEnabled}
                          showClassLabel
                          dungeonOrder={dungeonOrder}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {soloQueueEnabled && soloMapping.length > 0 && (
          <aside className="sq-sidebar">
            <SoloQueueTiers cutoffs={soloMapping} titleScore={lb.cutoff?.score} />
          </aside>
        )}
      </div>

      <VoteModal
        votes={lb.votes.filter(v => !lb.hiddenVoteKeys.includes(v.charKey) && !v.failed)}
        sessionId={lb.sessionId}
        onVote={lb.handleVoteCast}
        onClose={() => {
          const visibleKeys = lb.votes.filter(v => !lb.hiddenVoteKeys.includes(v.charKey)).map(v => v.charKey)
          lb.setHiddenVoteKeys(prev => [...new Set([...prev, ...visibleKeys])])
        }}
      />
    </div>
  )
}
