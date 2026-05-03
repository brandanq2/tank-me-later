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

const KEY = 'tank-me-later:daily:2026-05-01'
const TTL = 60 * 60 * 24 * 7

const scores = {
  "clobster-zul'jin-us":      1365.9,
  "hazzyipa-zuljin-us":       1015.6,
  "jacob-zuljin-us":          2856.8,
  "jeannë-zuljin-us":         1775.4,
  "killerspikez-tichondrius-us": 2762,
  "notdump-bleedinghollow-us": 3285.2,
  "prev-thrall-us":           3389.9,
  "taek-spinebreaker-us":      949.6,
  "vokeox-thrall-us":         2735.5,
  "volgorion-khadgar-us":     2503.6,
  "woodworker-zuljin-us":     1775.9,
}

const pairs = []
for (const [key, val] of Object.entries(scores)) {
  pairs.push(key, val)
}

await cmd('HSET', KEY, ...pairs)
await cmd('EXPIRE', KEY, String(TTL))

console.log(`Seeded ${Object.keys(scores).length} entries into ${KEY}`)
console.log('Done.')
