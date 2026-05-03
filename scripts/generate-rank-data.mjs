#!/usr/bin/env node
// Fetches rank cutoffs from the Tank-Me-Later Vercel API (source of truth),
// falling back to Raider.io directly, and regenerates addon/TankMeLater/RankData.lua.
// Usage: node scripts/generate-rank-data.mjs [season-slug] [region]
//   season-slug  default: auto-detected
//   region       default: us

import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH  = resolve(__dirname, '../addon/TankMeLater/RankData.lua')

const region = process.argv[3] || 'us'
const today  = new Date().toISOString().slice(0, 10)

// ── Try Vercel API first (source of truth) ───────────────────────────────────

const VERCEL_URL = process.env.VERCEL_APP_URL || 'https://tank-me-later.vercel.app'

let season = process.argv[2]
let cutoffs = null   // RankCutoff[] if loaded from Vercel
let data    = null   // raw Raider.io response if falling back

async function tryVercelAPI() {
    try {
        console.log(`Fetching rank mapping from ${VERCEL_URL}/api/solo-queue-mapping…`)
        const resp = await fetch(`${VERCEL_URL}/api/solo-queue-mapping`)
        if (!resp.ok) return null
        const body = await resp.json()
        if (!Array.isArray(body?.ranks) || body.ranks.length < 10) return null
        return body
    } catch { return null }
}

// ── Raider.io fallback ────────────────────────────────────────────────────────

async function fetchCutoffs(slug) {
    const url  = `https://raider.io/api/v1/mythic-plus/season-cutoffs?season=${slug}&region=${region}`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const d = await resp.json()
    const root = d?.cutoffs ?? d
    if (typeof root?.p999?.all?.quantileMinValue !== 'number') return null
    return { slug, data: d }
}

// Use Vercel only when no explicit season is requested
const vercel = season ? null : await tryVercelAPI()

if (vercel) {
    console.log(`Using Vercel data — season: ${vercel.season}, updated: ${vercel.updatedAt}`)
    season  = vercel.season
    cutoffs = vercel.ranks
} else {
    console.warn('Vercel API unavailable — falling back to Raider.io directly')
    const candidates = ['season-mn-1', 'season-tww-3', 'season-tww-2', 'season-tww-1']
    const probe = season ? [season] : candidates
    let found = null
    for (const slug of probe) {
        console.log(`Probing ${slug}…`)
        found = await fetchCutoffs(slug)
        if (found) break
    }
    if (!found) throw new Error('No live season found on Raider.io and Vercel API unavailable')
    season = found.slug
    data   = found.data
    console.log(`Raider.io season: ${season}`)
}

// ── Build cutoffs array ───────────────────────────────────────────────────────

if (!cutoffs) {
    // Raider.io fallback: compute from anchors
    const cutoffsRoot = data?.cutoffs ?? data
    const ANCHOR_KEYS = [['p999', 0.1], ['p990', 1.0], ['p900', 10.0], ['p750', 25.0], ['p600', 40.0]]
    const anchors = []
    for (const [key, topPercent] of ANCHOR_KEYS) {
        const score = cutoffsRoot?.[key]?.all?.quantileMinValue
        if (typeof score === 'number') anchors.push({ topPercent, score })
    }
    if (anchors.length < 2) throw new Error(`Not enough anchor points (got ${anchors.length})`)
    console.log(`Anchors: ${anchors.map(a => `${a.topPercent}%→${a.score}`).join('  ')}`)

    const RANK_THRESHOLDS = [
        { tier: 'Challenger',  division: null,  topPercent:   0.03 },
        { tier: 'Grandmaster', division: null,  topPercent:   0.1  },
        { tier: 'Master',      division: null,  topPercent:   0.5  },
        { tier: 'Diamond',     division: 'I',   topPercent:   1.0  },
        { tier: 'Diamond',     division: 'II',  topPercent:   1.3  },
        { tier: 'Diamond',     division: 'III', topPercent:   1.7  },
        { tier: 'Diamond',     division: 'IV',  topPercent:   3.1  },
        { tier: 'Emerald',     division: 'I',   topPercent:   4.0  },
        { tier: 'Emerald',     division: 'II',  topPercent:   5.4  },
        { tier: 'Emerald',     division: 'III', topPercent:   7.0  },
        { tier: 'Emerald',     division: 'IV',  topPercent:   9.0  },
        { tier: 'Platinum',    division: 'I',   topPercent:  11.0  },
        { tier: 'Platinum',    division: 'II',  topPercent:  13.0  },
        { tier: 'Platinum',    division: 'III', topPercent:  15.0  },
        { tier: 'Platinum',    division: 'IV',  topPercent:  17.7  },
        { tier: 'Gold',        division: 'I',   topPercent:  20.0  },
        { tier: 'Gold',        division: 'II',  topPercent:  22.0  },
        { tier: 'Gold',        division: 'III', topPercent:  24.0  },
        { tier: 'Gold',        division: 'IV',  topPercent:  26.4  },
        { tier: 'Silver',      division: 'I',   topPercent:  32.0  },
        { tier: 'Silver',      division: 'II',  topPercent:  38.0  },
        { tier: 'Silver',      division: 'III', topPercent:  44.0  },
        { tier: 'Silver',      division: 'IV',  topPercent:  51.8  },
        { tier: 'Bronze',      division: 'I',   topPercent:  58.0  },
        { tier: 'Bronze',      division: 'II',  topPercent:  64.0  },
        { tier: 'Bronze',      division: 'III', topPercent:  70.0  },
        { tier: 'Bronze',      division: 'IV',  topPercent:  77.0  },
        { tier: 'Iron',        division: 'I',   topPercent:  84.0  },
        { tier: 'Iron',        division: 'II',  topPercent:  88.0  },
        { tier: 'Iron',        division: 'III', topPercent:  92.0  },
        { tier: 'Iron',        division: 'IV',  topPercent: 100.0  },
    ]

    function topPercentToScore(topPercent, anch) {
        const pts = [...anch].sort((a, b) => a.topPercent - b.topPercent)
        const top = pts[0], bot = pts[pts.length - 1]
        if (topPercent <= top.topPercent) {
            const slope = (pts[1].score - top.score) / (pts[1].topPercent - top.topPercent)
            return top.score + (topPercent - top.topPercent) * slope
        }
        if (topPercent >= bot.topPercent) {
            const prev = pts[pts.length - 2]
            const slope = (bot.score - prev.score) / (bot.topPercent - prev.topPercent)
            return Math.max(0, bot.score + (topPercent - bot.topPercent) * slope)
        }
        for (let i = 0; i < pts.length - 1; i++) {
            const lo = pts[i], hi = pts[i + 1]
            if (topPercent >= lo.topPercent && topPercent <= hi.topPercent) {
                const t = (topPercent - lo.topPercent) / (hi.topPercent - lo.topPercent)
                return lo.score + t * (hi.score - lo.score)
            }
        }
        return 0
    }

    cutoffs = RANK_THRESHOLDS.map(r => ({
        tier:       r.tier,
        division:   r.division,
        label:      r.division ? `${r.tier} ${r.division}` : r.tier,
        minScore:   Math.max(0, Math.round(topPercentToScore(r.topPercent, anchors))),
        topPercent: r.topPercent,
    }))
}

// ── Render Lua ───────────────────────────────────────────────────────────────

const luaNull = 'nil'
const luaStr  = v => `"${v}"`
const luaDiv  = d => d ? luaStr(d) : luaNull
const pad     = (s, n) => s.padEnd(n)

const cutoffRows = cutoffs.map(c => {
    const tierCol  = pad(luaStr(c.tier),     pad(luaStr('Grandmaster'), 0).length)
    const divCol   = pad(luaDiv(c.division), luaStr('III').length)
    const labelCol = pad(luaStr(c.label),    luaStr('Grandmaster III').length)
    return `    { tier = ${tierCol}, division = ${divCol}, label = ${labelCol}, minScore = ${String(c.minScore).padStart(4)}, topPercent = ${String(c.topPercent).padStart(6)} },`
}).join('\n')

const lua = `-- AUTO-GENERATED by scripts/generate-rank-data.mjs — do not edit by hand.
-- Source: Tank-Me-Later Vercel API (falls back to Raider.io if unavailable).

TankMeLater = TankMeLater or {}
TankMeLater.Data = {}

-- Season metadata
TankMeLater.Data.Season      = "${season}"
TankMeLater.Data.UpdatedDate = "${today}"

-- Pre-computed minimum score for each rank boundary.
-- Ordered highest rank first (Challenger index 1, Iron IV last).
-- scoreToRank() scans this table and returns the first entry where score >= minScore.
TankMeLater.Data.Cutoffs = {
${cutoffRows}
}

-- Tier colors as (r, g, b) in [0-1] range, matching the Tank-Me-Later web app.
TankMeLater.Data.TierColors = {
    Challenger  = { r = 0.957, g = 0.816, b = 0.247 },
    Grandmaster = { r = 0.910, g = 0.145, b = 0.231 },
    Master      = { r = 0.608, g = 0.349, b = 0.714 },
    Diamond     = { r = 0.310, g = 0.765, b = 0.969 },
    Emerald     = { r = 0.180, g = 0.800, b = 0.443 },
    Platinum    = { r = 0.102, g = 0.737, b = 0.612 },
    Gold        = { r = 0.953, g = 0.612, b = 0.071 },
    Silver      = { r = 0.584, g = 0.647, b = 0.651 },
    Bronze      = { r = 0.804, g = 0.498, b = 0.196 },
    Iron        = { r = 0.498, g = 0.549, b = 0.553 },
}
`

writeFileSync(OUT_PATH, lua, 'utf8')
console.log(`Wrote ${OUT_PATH}`)
console.log(`  Top cutoff (Challenger): ${cutoffs[0].minScore}`)
console.log(`  Mid cutoff (Gold I):     ${cutoffs.find(c => c.label === 'Gold I')?.minScore}`)
