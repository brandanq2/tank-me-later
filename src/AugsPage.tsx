import { useLeaderboard, revealDelay } from './hooks/useLeaderboard'
import { AddCharacterForm } from './components/AddCharacterForm'
import { LeaderboardRow } from './components/LeaderboardRow'
import { VoteModal } from './components/VoteModal'
import { Nav } from './components/Nav'
import type { CharacterData } from './api'

function validateAug(data: CharacterData): string | null {
  if (data.className !== 'Evoker' || data.specName !== 'Augmentation') {
    return 'Not an Augmentation Evoker'
  }
  return null
}

export default function AugsPage() {
  const lb = useLeaderboard({
    listId: 'augs',
    ownedStorageKey: 'tank-me-later:owned:augs',
    initialCharacters: [],
    scoreField: 'dps',
    validate: validateAug,
  })

  return (
    <div className="app page-augs">
      <Nav />
      <header className="aug-page-header">
        <img src="/header-image.png" className="aug-header-img" alt="For All the Augs — BTW" />
        {lb.cutoff && (
          <p className="cutoff-badge">
            {lb.cutoff.percentile} cutoff&nbsp;
            <span className="cutoff-score">
              {lb.cutoff.score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          </p>
        )}
      </header>

      <div className="controls">
        <AddCharacterForm onAdd={(input) => lb.addCharacter(input, true)} loading={lb.anyLoading} />
        {lb.entries.length > 0 && (
          <button className="refresh-btn" onClick={lb.refreshAll} disabled={lb.anyLoading}>
            Refresh All
          </button>
        )}
      </div>

      {lb.entries.length === 0 ? (
        <p className="empty">Add an Augmentation Evoker above to get started.</p>
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
                />
              )
            })}
          </div>

          {lb.clowns.length > 0 && (
            <div className="clown-section">
              <h2 className="clown-title">🥚 Zero Aug IO</h2>
              <p className="clown-subtitle">0 DPS IO this season</p>
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
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
