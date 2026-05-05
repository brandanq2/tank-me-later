import { useEffect, useMemo, useState } from 'react'
import { useLeaderboard, revealDelay } from './hooks/useLeaderboard'
import { AddCharacterForm } from './components/AddCharacterForm'
import { LeaderboardRow } from './components/LeaderboardRow'
import { VoteModal } from './components/VoteModal'
import { Nav } from './components/Nav'
import { SoloQueueTiers } from './components/SoloQueueTiers'
import { useFlag } from './hooks/useFlags'
import { fetchSoloQueueMapping } from './api'
import type { RankCutoff } from './solo-queue'

export default function OpenLeaderboardPage() {
  const soloQueueEnabled = useFlag('solo-queue')
  const votingEnabled = useFlag('vote-to-kick')
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

  const dungeonOrder = useMemo(() => {
    const names = new Set<string>()
    for (const entry of lb.entries) {
      for (const run of entry.bestRuns ?? []) {
        names.add(run.shortName)
      }
    }
    return Array.from(names).sort()
  }, [lb.entries])

  return (
    <div className="app">
      <Nav />

      {/* TODO: replace with themed header */}
      <header className="header">
        <h1 className="title-stack">
          <span>Open</span>
          <span>Leader</span>
          <span>board</span>
        </h1>
        <p className="subtitle">Mythic+ IO Leaderboard</p>
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
          </div>

          {lb.entries.length === 0 ? (
            <p className="empty">Add characters above to build your leaderboard.</p>
          ) : (
            <div className={lb.revealed && !lb.isRefreshing ? undefined : 'pre-reveal'}>
              <div className="leaderboard">
                {lb.leaderboard.map((entry, i) => {
                  const rank = i + 1
                  const rankDelta = entry.prevRank != null ? entry.prevRank - rank : undefined
                  const charKey = `${entry.name}-${entry.realm}-${entry.region}`.toLowerCase()
                  const activeVote = lb.votes.find(v => v.charKey === charKey)
                  return (
                    <LeaderboardRow
                      key={entry.id}
                      entry={entry}
                      rank={rank}
                      rankDelta={rankDelta}
                      activeVote={activeVote}
                      sessionId={lb.sessionId}
                      cutoffScore={lb.cutoffScore}
                      revealed={lb.revealed}
                      isInitialEntry={lb.initialIds.has(entry.id)}
                      revealDelay={revealDelay(rank)}
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

              {lb.clowns.length > 0 && (
                <div className="clown-section">
                  <h2 className="clown-title">🤡 Clown List</h2>
                  <p className="clown-subtitle">0 IO this season</p>
                  <div className="leaderboard">
                    {lb.clowns.map((entry) => {
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
                          revealDelay={revealDelay(lb.leaderboard.length + 1)}
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
