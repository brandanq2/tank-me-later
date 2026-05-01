import { Redis } from '@upstash/redis'
import { neon } from '@neondatabase/serverless'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

function buildPrompt(race: string, gender: string, specName: string, className: string, charName: string) {
  const characterDesc = `${gender} ${race} ${specName} ${className}`.trim()
  const nameUpper = charName.toUpperCase()
  return (
    `Edit this album cover image with two changes. ` +
    `First: change the bold red word "BTW" in the title to "${nameUpper}" — same position, same bold red color, same large font size, same style. ` +
    `Second: replace the human subject with a ${characterDesc} from World of Warcraft — tight close-up of the face only, chin to forehead, filling the right side of the image, preserving the dramatic upward-tilted pose and harsh overhead lighting. ` +
    'Keep "TANK", "ME", and "LATER" exactly unchanged. ' +
    'Keep the high contrast black and white style with deep crimson red as the only color. ' +
    'No other text changes.'
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end()

  const sql = neon(process.env.DATABASE_URL!)

  // Find the character with the highest score present in every daily snapshot for the past 7 days.
  // This excludes anyone newly added mid-week.
  const rows = await sql`
    SELECT char_key, name, realm, region, MAX(score) AS max_score
    FROM score_history
    WHERE snapped_on > CURRENT_DATE - INTERVAL '8 days'
      AND score > 0
    GROUP BY char_key, name, realm, region
    HAVING COUNT(DISTINCT snapped_on) >= 7
    ORDER BY max_score DESC
    LIMIT 1
  `

  if (rows.length === 0) {
    console.log('[cron-weekly] no character with 7 consecutive days found')
    return res.json({ generated: false, reason: 'no eligible character' })
  }

  const { char_key: charKey, name, realm, region } = rows[0]
  console.log('[cron-weekly] selected character:', charKey)

  // Fetch current metadata from Raider.IO for race/gender/spec/class
  const params = new URLSearchParams({
    region, realm, name,
    fields: 'mythic_plus_scores_by_season:current',
  })
  const rioRes = await fetch(`https://raider.io/api/v1/characters/profile?${params}`)
  if (!rioRes.ok) {
    console.error('[cron-weekly] raiderio fetch failed:', rioRes.status)
    return res.status(500).json({ error: `raiderio ${rioRes.status}` })
  }
  const rioData = await rioRes.json()
  const race: string = rioData.race
  const isFemale = rioData.gender === 1 || String(rioData.gender).toLowerCase() === 'female'
  const gender = isFemale ? 'female' : 'male'
  const specName: string = rioData.active_spec_name
  const className: string = rioData.class

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const inputImage = `https://${productionHost}/album-cover.png`
  const prompt = buildPrompt(race, gender, specName, className, name)
  console.log('[cron-weekly] prompt:', prompt)

  type Prediction = { id: string; status: string; output?: string | string[]; error?: string; detail?: string }

  const createRes = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'respond-async',
      },
      body: JSON.stringify({
        input: { prompt, input_image: inputImage, output_format: 'jpg', output_quality: 95 },
      }),
    }
  )
  const created = await createRes.json() as Prediction
  console.log('[cron-weekly] create response:', createRes.status, JSON.stringify(created))

  if (!created.id) {
    return res.status(500).json({ error: created.error ?? created.detail ?? 'No prediction ID returned' })
  }

  // Poll until done (up to 100s)
  let prediction: Prediction = created
  const deadline = Date.now() + 100_000
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000))
    prediction = await fetch(`https://api.replicate.com/v1/predictions/${created.id}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    }).then(r => r.json()) as Prediction
    console.log('[cron-weekly] poll status:', prediction.status)
  }

  if (prediction.error || prediction.status !== 'succeeded' || !prediction.output) {
    return res.status(500).json({ error: prediction.error ?? 'Generation timed out or failed' })
  }

  const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output

  // Increment the persistent week counter (no TTL — survives forever)
  const prevWeek = await redis.get<number>('tank-me-later:weekly-number') ?? 0
  const weekNumber = prevWeek + 1
  await redis.set('tank-me-later:weekly-number', weekNumber)

  // Cache the full weekly cover data with a 9-day TTL (outlasts the next weekly run)
  const ttl = 60 * 60 * 24 * 9
  const weeklyData = {
    imageUrl,
    weekNumber,
    charKey,
    charName: name,
    score: Number(rows[0].max_score),
  }
  await Promise.all([
    redis.set('tank-me-later:weekly-cover', weeklyData, { ex: ttl }),
    redis.set(`tank-me-later:cover:${charKey}`, imageUrl, { ex: ttl }),
  ])

  console.log('[cron-weekly] week', weekNumber, 'cover cached for:', charKey)
  return res.json({ generated: true, weekNumber, charKey, imageUrl })
}
