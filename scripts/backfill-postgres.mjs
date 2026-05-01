import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const url = process.env.KV_REST_API_URL
const token = process.env.KV_REST_API_TOKEN

async function redisCmd(...parts) {
  const path = parts.map(p => encodeURIComponent(p)).join('/')
  const res = await fetch(`${url}/${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await res.json()
  if (body.error) throw new Error(body.error)
  return body.result
}

const DATE = '2026-04-30'
const fields = await redisCmd('HGETALL', `tank-me-later:daily:${DATE}`)

if (!fields || fields.length === 0) {
  console.log('No data found for', DATE)
  process.exit(0)
}

let inserted = 0
for (let i = 0; i < fields.length; i += 2) {
  const charKey = fields[i]
  const score = parseFloat(fields[i + 1])
  const [name, realm, region] = charKey.split('-')

  await sql`
    INSERT INTO score_history (char_key, name, realm, region, score, snapped_on)
    VALUES (${charKey}, ${name}, ${realm}, ${region}, ${score}, ${DATE})
    ON CONFLICT (char_key, snapped_on) DO UPDATE SET score = EXCLUDED.score
  `
  console.log(`  ${charKey}: ${score}`)
  inserted++
}

console.log(`\nDone. Inserted/updated ${inserted} rows for ${DATE}.`)
