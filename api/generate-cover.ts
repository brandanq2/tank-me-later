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

function insetUrl(thumbnailUrl: string): string {
  return thumbnailUrl.replace(/-avatar\.jpg/, '-inset.jpg')
}

const PORTRAIT_STRIP_W = 350

async function buildComposite(coverBuf: Buffer, portraitBuf: Buffer): Promise<{ buf: Buffer; portraitW: number; coverW: number; coverH: number }> {
  const coverMeta = await sharp(coverBuf).metadata()
  const coverW = coverMeta.width!
  const coverH = coverMeta.height!

  // Scale portrait to a narrow fixed-width strip so the album cover dominates (~80% of composite)
  const scaledPortrait = await sharp(portraitBuf)
    .resize({ width: PORTRAIT_STRIP_W, height: coverH, fit: 'cover', position: 'top' })
    .toBuffer()

  const buf = await sharp({
    create: { width: PORTRAIT_STRIP_W + coverW, height: coverH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: scaledPortrait, left: 0, top: 0 },
      { input: coverBuf, left: PORTRAIT_STRIP_W, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()

  return { buf, portraitW: PORTRAIT_STRIP_W, coverW, coverH }
}

function buildPrompt(race: string, gender: string, specName: string, className: string, charName: string, hasPortrait: boolean) {
  const characterDesc = `${gender} ${race} ${specName} ${className}`.trim()
  const nameUpper = charName.toUpperCase()

  if (hasPortrait) {
    return (
      `This image has two panels. The narrow LEFT strip is a color character portrait — use it as a visual reference only, do not modify it. ` +
      `The RIGHT panel is a high-contrast black-and-white album cover with crimson red accents. Make exactly two edits to the RIGHT panel:\n\n` +
      `EDIT 1: Change the bold red word "BTW" to "${nameUpper}". Keep the exact same position, bold red color, font size, and lettering style. This text change is mandatory.\n\n` +
      `EDIT 2: Replace the face and head of the person in the RIGHT panel with the character shown in the LEFT strip. ` +
      `The character must keep the same dramatic upward-tilted pose and harsh overhead rim lighting as the original. ` +
      `Convert the character's appearance into the same high-contrast black-and-white photographic style as the rest of the album cover — deep shadows, blown-out highlights, no color except the existing crimson red elements. ` +
      `Faithfully reproduce all distinctive features from the LEFT reference: exact hair shape and length, eye shape and any glow effects (rendered in B&W), facial markings and tattoos, non-human ear shape, skin texture, and any armor or shoulder pieces visible at the neck. ` +
      `Do not simplify or humanize the character's non-human racial features.\n\n` +
      `Everything else in the RIGHT panel stays exactly as-is: black background, CD jewel case frame, "TANK" / "ME" / "LATER" text, parental advisory sticker, overall composition. No new elements, no background changes.`
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
        const portraitSrc = insetUrl(thumbnailUrl)
        console.log('[generate-cover] fetching portrait:', portraitSrc)
        const [coverBuf, portraitBuf] = await Promise.all([
          fetchBuffer(albumCoverUrl),
          fetchBuffer(portraitSrc),
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
        const outputMeta = await sharp(outputBuf).metadata()
        const outW = outputMeta.width!
        const outH = outputMeta.height!
        const totalInputW = compositeInfo.portraitW + compositeInfo.coverW
        const cropX = Math.round(outW * compositeInfo.portraitW / totalInputW)
        console.log('[generate-cover] crop: outW', outW, 'cropX', cropX, 'cropW', outW - cropX)
        const croppedBuf = await sharp(outputBuf)
          .extract({ left: cropX, top: 0, width: outW - cropX, height: outH })
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
