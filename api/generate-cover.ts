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
  'Transform this character into a gritty hip-hop album cover portrait in the style of Drake\'s Thank Me Later. ' +
  'Extreme high contrast black and white photography. ' +
  'Deep crimson red (#E43831) paint splatters and streaks bleeding across the image as the only color. ' +
  'Harsh directional lighting from above casting dramatic shadows across the face. ' +
  'Subject with head tilted slightly back, mouth wide open, eyes intense and half-closed — raw visceral expression. ' +
  'Dark scratched film grain texture background. ' +
  'Square crop composition. ' +
  'Parental Advisory Explicit Content sticker in the bottom-left corner. ' +
  'Photorealistic, cinematic, album art quality.'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { thumbnailUrl, charKey } = req.body as { thumbnailUrl?: string; charKey?: string }
  if (!thumbnailUrl || !charKey) return res.status(400).json({ error: 'thumbnailUrl and charKey required' })

  const cached = await redis.get<string>(coverCacheKey(charKey))
  if (cached) return res.json({ imageUrl: cached })

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
