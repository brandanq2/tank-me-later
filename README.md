# tank-me-later

npm-workspaces monorepo holding two independently deployed Vercel projects and the
WoW addon.

```
apps/
  tank-me-later/   CLB leaderboard, tanks, augs      → Vercel project "tank-me-later"
  title-watch/     Title Watch + Command Room        → Vercel project "title-watch"
packages/
  shared/          types, titleStatus, StatusPill, AddCharacterForm, useFlags, index.css
addon/             TankMeLater WoW addon (unchanged)
scripts/           addon rank-data generation (unchanged)
```

## Local development

```bash
npm install              # once, at the repo root — installs both apps
npm run dev              # tank-me-later on :5173
npm run dev:watch        # title-watch  on :5174
npm run build            # builds both apps
```

`vite dev` proxies `/api/raiderio` and `/api/cutoff` straight to raider.io. The
other routes (`/api/title-watch`, `/api/scores`, …) are Vercel Functions and need
`vercel dev` to exercise locally.

## Vercel setup

Two projects, both pointing at this repo on `main`, distinguished by Root Directory.
Leave "Include source files outside of the Root Directory" enabled so
`packages/shared` is available at build time.

| | tank-me-later | title-watch |
|---|---|---|
| Root Directory | `apps/tank-me-later` | `apps/title-watch` |
| Env vars | `DATABASE_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `EDGE_CONFIG`, `CRON_SECRET` | `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| Crons | `/api/cron` daily, `/api/solo-queue-cron` weekly | none |

Point **title-watch at the same Upstash Redis** as tank-me-later. The cache and
perma-watch list use the existing `tank-me-later:title-watch:*` keys, so the watch
list carries over with no migration.

### Cross-app links

Linking is one-way on purpose: tank-me-later links out to Title Watch and the
Command Room, but title-watch is those two pages only and does not link back to
the leaderboard.

Set `VITE_TITLE_WATCH_URL` on tank-me-later (e.g. `https://title-watch.vercel.app`).
It is read at build time, so changing it needs a redeploy.

`/watch` and `/command-room` on tank-me-later redirect to the new app via
`src/titleWatchUrl.tsx`. That is a client-side hop so it works without a redeploy
when the URL changes. Once the destination has a stable custom domain, replace it
with a real 308 in `apps/tank-me-later/vercel.json`:

```json
"redirects": [
  { "source": "/watch", "destination": "https://…", "permanent": true },
  { "source": "/command-room", "destination": "https://…/command-room", "permanent": true }
]
```

### Command Room → Title Watch

Each stream in the Command Room has a `+ Watch` toggle — on the tile, in the focus
view (or `w`), and on the fullscreen overlay. It writes to the same
`tank-me-later:title-watch:perma` list the Title Watch page uses, so a streamer
added from a stream keeps showing up on Title Watch after they leave the cutoff
window. Button state comes from `GET /api/title-watch?view=perma`, a plain Redis
read that skips the roster recompute.

## Known duplication

`api/cutoff.ts` and `api/raiderio.ts` exist in both apps. They are thin raider.io
proxies, and each Vercel project needs its own copy under its own `api/` directory.
Keep them in sync by hand, or consolidate into `packages/shared` and re-export if
they ever grow.

`packages/shared/styles/index.css` is the whole original stylesheet, shipped to both
apps. Title Watch loads some leaderboard rules it never uses (~7 kB gzipped total),
which is not worth the regression risk of splitting it by hand.
