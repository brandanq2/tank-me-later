import type { VercelRequest, VercelResponse } from '@vercel/node'

const PROMPT =
  'Transform this World of Warcraft character portrait into a Drake "Thank Me Later" style album cover. ' +
  'Dramatic close-up, high contrast black and white with deep red accents. Gritty, raw, moody. ' +
  'Subject facing slightly upward, mouth open, intense expression. ' +
  'Keep the character\'s facial features recognizable. ' +
  'Parental Advisory Explicit Content sticker in the bottom-left corner. ' +
  'Album cover square composition.'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { thumbnailUrl } = req.body as { thumbnailUrl?: string }
  if (!thumbnailUrl) return res.status(400).json({ error: 'thumbnailUrl required' })

  const response = await fetch(
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
        },
      }),
    }
  )

  const prediction = await response.json() as {
    id: string
    status: string
    output?: string | string[]
    error?: string
  }

  if (prediction.error) return res.status(500).json({ error: prediction.error })

  if (prediction.status === 'succeeded' && prediction.output) {
    const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
    return res.json({ imageUrl })
  }

  return res.status(500).json({ error: 'Generation timed out', predictionId: prediction.id })
}
