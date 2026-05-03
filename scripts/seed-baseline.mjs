/**
 * Seeds tank-me-later:daily:2026-05-01 with the known May-1 scores so that
 * today's (May 2) delta comparison has the correct baseline.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-baseline.mjs
 */

const url   = process.env.KV_REST_API_URL
const token = process.env.KV_REST_API_TOKEN

if (!url || !token) {
  console.error('KV_REST_API_URL and KV_REST_API_TOKEN must be set')
  process.exit(1)
}

async function cmd(...parts) {
  const path = parts.map(p => encodeURIComponent(String(p))).join('/')
  const res = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  if (body.error) throw new Error(body.error)
  return body.result
}

const TTL = 60 * 60 * 24 * 7

// Compute yesterday's date (UTC) — the key scores.ts currently reads
const yest = new Date()
yest.setUTCDate(yest.getUTCDate() - 1)
const yesterdayStr = yest.toISOString().slice(0, 10)

const SRC_KEY  = 'tank-me-later:daily:2026-05-01'
const DEST_KEY = `tank-me-later:daily:${yesterdayStr}`

if (SRC_KEY === DEST_KEY) {
  console.log(`Source and destination are the same (${SRC_KEY}) — nothing to do.`)
  process.exit(0)
}

console.log(`Copying ${SRC_KEY} → ${DEST_KEY}`)

const fields = await cmd('HGETALL', SRC_KEY)
if (!fields || fields.length === 0) {
  console.error(`Source key ${SRC_KEY} is empty or missing`)
  process.exit(1)
}

const pairs = []
for (let i = 0; i < fields.length; i += 2) {
  pairs.push(fields[i], fields[i + 1])
}

await cmd('HSET', DEST_KEY, ...pairs)
await cmd('EXPIRE', DEST_KEY, String(TTL))

console.log(`Copied ${fields.length / 2} entries`)
console.log('Done.')
