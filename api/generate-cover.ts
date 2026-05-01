import { put } from '@vercel/blob'
import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

function coverCacheKey(charKey: string) {
  return `tank-me-later:cover:${charKey}`
}

const PROMPT =
  'Redraw the character from this image as the subject of a dramatic hip-hop album cover portrait. ' +
  'Keep the character\'s facial features, armor, and non-human traits fully intact and recognizable. ' +
  'Render in extreme high contrast black and white with deep crimson red (#E43831) paint splatters and streaks as the only color accent. ' +
  'Subject facing forward, head slightly tilted back, mouth open wide, eyes intense and half-closed — raw visceral expression. ' +
  'Harsh directional lighting from above creating dramatic shadows on the face and armor. ' +
  'Dark distressed background with scratched film grain texture. ' +
  'Photorealistic render, cinematic quality, square album cover composition. ' +
  'Parental Advisory Explicit Content sticker in the bottom-left corner. ' +
  'No text, no names, no titles anywhere on the image.'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { thumbnailUrl, charKey } = req.body as { thumbnailUrl?: string; charKey?: string }
  if (!thumbnailUrl || !charKey) return res.status(400).json({ error: 'thumbnailUrl and charKey required' })

  const bust = req.query.bust === '1'
  if (!bust) {
    const cached = await redis.get<string>(coverCacheKey(charKey))
    if (cached) return res.json({ imageUrl: cached })
  }

  const prediction = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: PROMPT,
          input_image: thumbnailUrl,
          output_format: 'jpg',
          output_quality: 95,
          safety_tolerance: 5,
        },
      }),
    }
  ).then(r => r.json()) as { id: string; status: string; output?: string | string[]; error?: string }

  if (prediction.error) return res.status(500).json({ error: prediction.error })
  if (prediction.status !== 'succeeded' || !prediction.output) {
    return res.status(500).json({ error: 'Generation timed out', predictionId: prediction.id })
  }

  const replicateUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output

  const imageRes = await fetch(replicateUrl)
  const imageBlob = await imageRes.blob()
  const { url: blobUrl } = await put(`covers/${charKey}.jpg`, imageBlob, { access: 'public' })

  await redis.set(coverCacheKey(charKey), blobUrl)

  return res.json({ imageUrl: blobUrl })
}
