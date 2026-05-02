import { createHash } from 'crypto'
import sharp from 'sharp'
import { put, del } from '@vercel/blob'
import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

function coverCacheKey(charKey: string) {
  return `tank-me-later:cover:${charKey}`
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image ${url}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function fetchPortraitBuffer(thumbnailUrl: string): Promise<Buffer> {
  // Strip ?alt= so missing renders return 403/404 instead of the 2D class silhouette,
  // which is large enough to silently pass a size check.
  const baseUrl = thumbnailUrl.split('?')[0]
  const mainUrl = baseUrl.replace(/-avatar\.jpg$/, '-main.jpg')
  const insetUrl = baseUrl.replace(/-avatar\.jpg$/, '-inset.jpg')

  for (const url of [mainUrl, insetUrl]) {
    try {
      const buf = await fetchBuffer(url)
      if (buf.length > 10_000) return buf
    } catch {}
  }

  // Last resort: original URL with ?alt= intact — always returns something
  return fetchBuffer(thumbnailUrl)
}

async function buildComposite(coverBuf: Buffer, portraitBuf: Buffer): Promise<{ buf: Buffer; portraitW: number; coverW: number; coverH: number }> {
  const coverMeta = await sharp(coverBuf).metadata()
  const coverW = coverMeta.width!
  const coverH = coverMeta.height!

  const scaledPortrait = await sharp(portraitBuf)
    .resize({ height: coverH, fit: 'cover', position: 'top' })
    .normalize()
    .toBuffer()
  const portraitMeta = await sharp(scaledPortrait).metadata()
  const portraitW = portraitMeta.width!

  const buf = await sharp({
    create: { width: portraitW + coverW, height: coverH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: scaledPortrait, left: 0, top: 0 },
      { input: coverBuf, left: portraitW, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()

  return { buf, portraitW, coverW, coverH }
}

function buildPrompt(race: string, gender: string, specName: string, className: string, charName: string, hasPortrait: boolean) {
  const characterDesc = `${gender} ${race} ${specName} ${className}`.trim()
  const nameUpper = charName.toUpperCase()

  if (hasPortrait) {
    return (
      `This image has two panels side by side. ` +
      `The LEFT panel is a reference portrait of a World of Warcraft character — a ${characterDesc}. ` +
      `The RIGHT panel is an album cover that must be edited. Do not alter the left panel at all. ` +
      `Make exactly two changes to the RIGHT panel only: ` +
      `First: change the bold red word "BTW" to "${nameUpper}" — same position, same bold red color, same font size and style. ` +
      `Second: replace the face of the human subject in the right panel with the face of the character from the LEFT panel. ` +
      `Copy their exact appearance: skin color, facial structure, racial features, non-human characteristics (pointy ears, tusks, markings, animal features, etc.), eye color, and any visible armor or accessories around the face. ` +
      `Do NOT make the character look human — they are a fantasy ${race} and must retain every non-human racial feature exactly as shown in the left panel. ` +
      `Keep the same dramatic upward-tilted pose and harsh high-contrast overhead lighting from the original right panel. ` +
      `Keep "TANK", "ME", and "LATER" exactly unchanged. ` +
      `Maintain the high contrast black and white style with deep crimson red as the only color. ` +
      `No other changes.`
    )
  }

  return (
    `Edit this album cover image with two changes. ` +
    `First: change the bold red word "BTW" in the title to "${nameUpper}" — same position, same bold red color, same large font size, same style. ` +
    `Second: replace the human subject with a ${characterDesc} from World of Warcraft — tight close-up of the face only, chin to forehead, filling the right side of the image, preserving the dramatic upward-tilted pose and harsh overhead lighting. Preserve all non-human racial features of a ${race}. ` +
    `Keep "TANK", "ME", and "LATER" exactly unchanged. ` +
    `Keep the high contrast black and white style with deep crimson red as the only color. ` +
    `No other text changes.`
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { charKey, race, gender, specName, className, charName, thumbnailUrl } = req.body as {
    charKey?: string
    race?: string
    gender?: string
    specName?: string
    className?: string
    charName?: string
    thumbnailUrl?: string
  }
  if (!charKey || !race || !gender || !specName || !className || !charName) {
    return res.status(400).json({ error: 'charKey, race, gender, specName, className, and charName are required' })
  }

  console.log('[generate-cover] handler called, charKey:', charKey)
  let tempCompositeUrl: string | null = null

  try {
    const bust = req.query.bust === '1'
    const cached = await redis.get<string>(coverCacheKey(charKey))
    console.log('[generate-cover] cache hit:', !!cached)
    if (!bust && cached) return res.json({ imageUrl: cached })

    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host
    const albumCoverUrl = `https://${productionHost}/album-cover.png`

    let inputImage = albumCoverUrl
    let compositeInfo: { portraitW: number; coverW: number; coverH: number } | null = null

    if (thumbnailUrl) {
      try {
        console.log('[generate-cover] fetching portrait for:', thumbnailUrl)
        const [coverBuf, portraitBuf] = await Promise.all([
          fetchBuffer(albumCoverUrl),
          fetchPortraitBuffer(thumbnailUrl),
        ])
        const composite = await buildComposite(coverBuf, portraitBuf)
        const blob = await put(
          `covers/tmp-${createHash('sha256').update(charKey).digest('hex').slice(0, 8)}.jpg`,
          composite.buf,
          { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true },
        )
        tempCompositeUrl = blob.url
        inputImage = blob.url
        compositeInfo = { portraitW: composite.portraitW, coverW: composite.coverW, coverH: composite.coverH }
        console.log('[generate-cover] composite uploaded:', blob.url, 'portraitW:', composite.portraitW)
      } catch (err) {
        console.warn('[generate-cover] portrait composite failed, falling back to album cover only:', err)
      }
    }

    const prompt = buildPrompt(race, gender, specName, className, charName, !!compositeInfo)
    console.log('[generate-cover] prompt:', prompt)

    type Prediction = { id: string; status: string; output?: string | string[]; error?: string }

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
    const created = await createRes.json() as Prediction & { detail?: string; title?: string }
    console.log('[generate-cover] create response status:', createRes.status, 'body:', JSON.stringify(created))

    const createError = created.error ?? created.detail ?? (createRes.ok ? null : `HTTP ${createRes.status}`)
    if (createError || !created.id) return res.status(500).json({ error: createError ?? 'No prediction ID returned', raw: created })

    // Poll until succeeded or failed (up to 60s)
    let prediction: Prediction = created
    const deadline = Date.now() + 60_000
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 4000))
      prediction = await fetch(`https://api.replicate.com/v1/predictions/${created.id}`, {
        headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
      }).then(r => r.json()) as Prediction
      console.log('[generate-cover] poll status:', prediction.status)
    }

    if (prediction.error) return res.status(500).json({ error: prediction.error })
    if (prediction.status !== 'succeeded' || !prediction.output) {
      return res.status(500).json({ error: 'Generation timed out after 60s', predictionId: created.id })
    }

    const replicateUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output

    // If we used a composite input, crop the album cover portion out of the output and store permanently
    let finalUrl = replicateUrl
    if (compositeInfo) {
      try {
        const outputBuf = await fetchBuffer(replicateUrl)
        const croppedBuf = await sharp(outputBuf)
          .extract({ left: compositeInfo.portraitW, top: 0, width: compositeInfo.coverW, height: compositeInfo.coverH })
          .jpeg({ quality: 95 })
          .toBuffer()
        const resultBlob = await put(
          `covers/${createHash('sha256').update(charKey).digest('hex').slice(0, 8)}.jpg`,
          croppedBuf,
          { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false },
        )
        finalUrl = resultBlob.url
        console.log('[generate-cover] cropped result stored:', finalUrl)
      } catch (err) {
        console.warn('[generate-cover] crop/store failed, using raw Replicate URL:', err)
      }
    }

    await redis.set(coverCacheKey(charKey), finalUrl, { ex: 60 * 60 * 24 * 7 })
    return res.json({ imageUrl: finalUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[generate-cover] unhandled error:', message)
    return res.status(500).json({ error: message })
  } finally {
    if (tempCompositeUrl) {
      del(tempCompositeUrl).catch(() => {})
    }
  }
}
