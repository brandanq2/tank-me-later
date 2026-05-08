# Disabled: Vote-to-Kick

The vote-to-kick feature was disabled on 2026-05-08 because the project is on the
Vercel Hobby plan, which caps deployments at 12 Serverless Functions. Adding the
warband daily-delta function (`api/warband-scores.ts`) pushed us to 13 and broke
deploys. Voting was already gated behind the `vote-to-kick` Edge Config flag and
was off in production, so removing the backend was a no-op for users.

## What was removed

- `api/votes.ts` — `GET` listed active votes; `POST` initiated a new vote.
- `api/vote-cast.ts` — `POST` cast a yes/no on an existing vote.

Both files manipulated Redis records under `tank-me-later:vote:<charKey>` and the
set `tank-me-later:votes:active`. They shared an IP-hashing helper (sha256 of the
client IP, salted with `"tml:vote:"`, truncated to 16 hex chars) used to prevent
double-voting from the same network.

Voting thresholds at the time of removal:
- 5 yes votes → character removed from the public list.
- 5 no votes → vote marked failed and locked for the remaining 24h TTL.

## What was kept

The frontend voting code is still present and still gated by `useFlag('vote-to-kick')`:

- `src/api.ts` — `fetchVotes`, `initiateVote`, `castVote` (would now hit 404s).
- `src/hooks/useLeaderboard.ts` — vote polling is now wrapped in
  `if (!votingEnabled) return`, so the 10s `fetchVotes` poll does not run when
  the flag is off. `handleRemoveOrVote` and `handleVoteCast` are unreachable
  while the X button is gated by `votingEnabled || entry.isOwned`.
- `src/components/VoteModal.tsx`, `VoteStrip`, `FailedStrip` in `LeaderboardRow.tsx`.

## To restore

1. Recover the API files:
   ```
   git show eaeed87^:api/votes.ts > api/votes.ts
   git show eaeed87^:api/vote-cast.ts > api/vote-cast.ts
   ```
   (Use the commit immediately preceding the removal — pick one where both files
   still exist, e.g. `eaeed87^` or any earlier commit.)
2. Verify total function count stays ≤ 12, or upgrade to a Vercel Pro/Team plan.
3. Flip `vote-to-kick` to `true` in Edge Config.
4. Optionally remove the `if (!votingEnabled) return` guard in
   `src/hooks/useLeaderboard.ts` — keeping it is also fine since the flag now
   gates polling.

## Note on threshold drift

`api/votes.ts` defined `VOTES_NEEDED = 3`; `api/vote-cast.ts` defined it as `5`.
Only `vote-cast.ts`'s value actually mattered (it was the gate that resolved or
failed a vote); the constant in `votes.ts` was only used to mark a record
`failed` on read for already-tipped no-votes. If reimplementing, unify on a
single constant in a shared module.
