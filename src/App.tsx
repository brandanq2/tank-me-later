import { useEffect, useState } from 'react'
import { useLeaderboard, revealDelay } from './hooks/useLeaderboard'
import { AddCharacterForm } from './components/AddCharacterForm'
import { LeaderboardRow } from './components/LeaderboardRow'
import { VoteModal } from './components/VoteModal'
import { Nav } from './components/Nav'
import { useFlag } from './hooks/useFlags'
import { fetchSoloQueueMapping } from './api'
import { SoloQueueTiers } from './components/SoloQueueTiers'
import type { RankCutoff } from './solo-queue'
import type { CharacterInput } from './types'

const INITIAL_CHARACTERS: CharacterInput[] = [
  { name: 'Vokeox',     realm: 'thrall',  region: 'us' },
  { name: 'Jacob',      realm: 'zuljin',  region: 'us' },
  { name: 'Hazzyipa',   realm: 'zuljin',  region: 'us' },
  { name: 'Prev',       realm: 'thrall',  region: 'us' },
  { name: 'Volgorion',  realm: 'khadgar', region: 'us' },
  { name: 'Woodworker', realm: 'zuljin',  region: 'us' },
]

export default function App() {
  const soloQueueEnabled = useFlag('solo-queue')
  const [soloMapping, setSoloMapping] = useState<RankCutoff[]>([])

  useEffect(() => {
    if (soloQueueEnabled) fetchSoloQueueMapping().then(setSoloMapping)
  }, [soloQueueEnabled])

  const lb = useLeaderboard({
    listId: 'tanks',
    ownedStorageKey: 'tank-me-later:owned',
    initialCharacters: INITIAL_CHARACTERS,
    scoreField: 'tank',
  })

  return (
    <div className="app">
      <Nav />
      <header className="header">
        <h1 className="title-stack">
          <span>Tank</span>
          <span><span className="title-accent">BTW</span> Me</span>
          <span>Later</span>
        </h1>
        <p className="subtitle">Mythic+ Tank IO Leaderboard</p>
        <p className="header-disclaimer">Yeah, I know what I said.</p>
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
                    />
                  )
                })}
              </div>

              {lb.clowns.length > 0 && (
                <div className="clown-section">
                  <h2 className="clown-title">🤡 Clown List</h2>
                  <p className="clown-subtitle">0 tank IO this season</p>
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
            <SoloQueueTiers cutoffs={soloMapping} />
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
