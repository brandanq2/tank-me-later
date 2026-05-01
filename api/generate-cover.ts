import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

function coverCacheKey(charKey: string) {
  return `tank-me-later:cover:${charKey}`
}

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
  if (req.method !== 'POST') return res.status(405).end()

  const { charKey, race, gender, specName, className, charName } = req.body as {
    charKey?: string
    race?: string
    gender?: string
    specName?: string
    className?: string
    charName?: string
  }
  if (!charKey || !race || !gender || !specName || !className || !charName) {
    return res.status(400).json({ error: 'charKey, race, gender, specName, className, and charName are required' })
  }

  try {
    const bust = req.query.bust === '1'
    if (!bust) {
      const cached = await redis.get<string>(coverCacheKey(charKey))
      if (cached) return res.json({ imageUrl: cached })
    }

    // Use the album cover as the style reference input
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https'
    const host = req.headers.host ?? process.env.VERCEL_URL
    const albumCoverUrl = `${proto}://${host}/album-cover.png`

    console.log('[generate-cover] fetching album cover from', albumCoverUrl)
    const albumRes = await fetch(albumCoverUrl)
    if (!albumRes.ok) throw new Error(`Failed to fetch album cover: ${albumRes.status} ${albumCoverUrl}`)
    const albumBuffer = await albumRes.arrayBuffer()
    const base64 = Buffer.from(albumBuffer).toString('base64')
    const inputImage = `data:image/png;base64,${base64}`

    const prompt = buildPrompt(race, gender, specName, className, charName)
    console.log('[generate-cover] prompt:', prompt)

    type Prediction = { id: string; status: string; output?: string | string[]; error?: string }

    const created = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_image: inputImage,
            output_format: 'jpg',
            output_quality: 95,
          },
        }),
      }
    ).then(r => r.json()) as Prediction

    if (created.error) return res.status(500).json({ error: created.error })
    console.log('[generate-cover] prediction created:', created.id)

    // Poll until succeeded or failed (up to 240s)
    let prediction: Prediction = created
    const deadline = Date.now() + 240_000
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 4000))
      prediction = await fetch(`https://api.replicate.com/v1/predictions/${created.id}`, {
        headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
      }).then(r => r.json()) as Prediction
      console.log('[generate-cover] poll status:', prediction.status)
    }

    if (prediction.error) return res.status(500).json({ error: prediction.error })
    if (prediction.status !== 'succeeded' || !prediction.output) {
      return res.status(500).json({ error: 'Generation timed out after 240s', predictionId: created.id })
    }

    const replicateUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output

    await redis.set(coverCacheKey(charKey), replicateUrl, { ex: 60 * 60 * 24 * 7 })

    return res.json({ imageUrl: replicateUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[generate-cover] unhandled error:', message)
    return res.status(500).json({ error: message })
  }
}
