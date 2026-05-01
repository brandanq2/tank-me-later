/**
 * One-off: copies tank-me-later:daily:2026-05-01 → 2026-04-30
 * (and the rank key) so score deltas show up on the leaderboard.
 *
 * Usage:
 *   vercel env pull .env.local
 *   node --env-file=.env.local scripts/backfill-daily-key.mjs
 *
 * Node 20.6+ required for --env-file. If you're on an older version:
 *   $env:KV_REST_API_URL="..."; $env:KV_REST_API_TOKEN="..."; node scripts/backfill-daily-key.mjs
 */

const url   = process.env.KV_REST_API_URL
const token = process.env.KV_REST_API_TOKEN

if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_TOKEN must be set')
  process.exit(1)
}

async function cmd(...parts) {
  const path = parts.map(p => encodeURIComponent(p)).join('/')
  const res = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  if (body.error) throw new Error(body.error)
  return body.result
}

const SRC  = '2026-05-01'
const DST  = '2026-04-30'
const TTL  = 60 * 60 * 24 * 7

for (const prefix of ['tank-me-later:daily', 'tank-me-later:daily-rank']) {
  const srcKey = `${prefix}:${SRC}`
  const dstKey = `${prefix}:${DST}`

  const fields = await cmd('HGETALL', srcKey)
  if (!fields || fields.length === 0) {
    console.log(`${srcKey}: empty or missing, skipping`)
    continue
  }

  // HGETALL returns [field, value, field, value, ...]
  const pairs = []
  for (let i = 0; i < fields.length; i += 2) {
    pairs.push(fields[i], fields[i + 1])
  }

  await cmd('HSET', dstKey, ...pairs)
  await cmd('EXPIRE', dstKey, String(TTL))
  console.log(`Copied ${fields.length / 2} entries: ${srcKey} → ${dstKey}`)
}

console.log('Done.')
