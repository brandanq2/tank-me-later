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
  'Extreme high contrast black and white tones with deep crimson red (#E43831) paint splatters as the only color. ' +
  'Subject facing forward, head slightly tilted back, eyes intense and half-closed, powerful expression. ' +
  'Harsh directional lighting from above casting deep shadows across the face and armor. ' +
  'Dark distressed background with scratched film grain texture. ' +
  'Photorealistic, cinematic, square album cover composition. ' +
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

  // Fetch the thumbnail server-side and pass as base64 to avoid URL-based filtering
  const thumbRes = await fetch(thumbnailUrl)
  const thumbBuffer = await thumbRes.arrayBuffer()
  const base64 = Buffer.from(thumbBuffer).toString('base64')
  const mimeType = thumbRes.headers.get('content-type') ?? 'image/jpeg'
  const inputImage = `data:${mimeType};base64,${base64}`

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
          input_image: inputImage,
          output_format: 'jpg',
          output_quality: 95,
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
