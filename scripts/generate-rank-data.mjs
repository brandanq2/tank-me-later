#!/usr/bin/env node
// Fetches live Raider.io season-cutoffs data and regenerates addon/TankMeLater/RankData.lua.
// Usage: node scripts/generate-rank-data.mjs [season-slug] [region]
//   season-slug  default: season-tww-2
//   region       default: world

import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH  = resolve(__dirname, '../addon/TankMeLater/RankData.lua')

const season = process.argv[2] || 'season-tww-2'
const region = process.argv[3] || 'world'
const today  = new Date().toISOString().slice(0, 10)

// ── Fetch ────────────────────────────────────────────────────────────────────

console.log(`Fetching Raider.io cutoffs for ${season} / ${region}…`)
const url  = `https://raider.io/api/v1/mythic-plus/season-cutoffs?season=${season}&region=${region}`
const resp = await fetch(url)
if (!resp.ok) throw new Error(`Raider.io API returned ${resp.status}: ${await resp.text()}`)
const data = await resp.json()

// ── Extract anchors (mirrors extractAnchors() in solo-queue.ts) ──────────────

const cutoffsRoot = data?.cutoffs ?? data
const ANCHOR_KEYS = [
    ['p999',  0.1],
    ['p990',  1.0],
    ['p900', 10.0],
    ['p750', 25.0],
    ['p600', 40.0],
]

const anchors = []
for (const [key, topPercent] of ANCHOR_KEYS) {
    const score = cutoffsRoot?.[key]?.all?.quantileMinValue
    if (typeof score === 'number') anchors.push({ topPercent, score })
}

if (anchors.length < 2) {
    throw new Error(`Not enough anchor points in API response (got ${anchors.length})`)
}

console.log(`Anchors: ${anchors.map(a => `${a.topPercent}%→${a.score}`).join('  ')}`)

// ── Rank thresholds (mirrors RANK_THRESHOLDS in solo-queue.ts) ───────────────

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

// ── topPercentToScore (mirrors solo-queue.ts) ────────────────────────────────

function topPercentToScore(topPercent, anch) {
    const pts = [...anch].sort((a, b) => a.topPercent - b.topPercent)
    const top = pts[0]
    const bot = pts[pts.length - 1]

    if (topPercent <= top.topPercent) {
        if (pts.length >= 2) {
            const next  = pts[1]
            const slope = (next.score - top.score) / (next.topPercent - top.topPercent)
            return top.score + (topPercent - top.topPercent) * slope
        }
        return top.score
    }
    if (topPercent >= bot.topPercent) {
        if (pts.length >= 2) {
            const prev  = pts[pts.length - 2]
            const slope = (bot.score - prev.score) / (bot.topPercent - prev.topPercent)
            return Math.max(0, bot.score + (topPercent - bot.topPercent) * slope)
        }
        return 0
    }
    for (let i = 0; i < pts.length - 1; i++) {
        const lo = pts[i]
        const hi = pts[i + 1]
        if (topPercent >= lo.topPercent && topPercent <= hi.topPercent) {
            const t = (topPercent - lo.topPercent) / (hi.topPercent - lo.topPercent)
            return lo.score + t * (hi.score - lo.score)
        }
    }
    return 0
}

// ── Compute cutoffs ──────────────────────────────────────────────────────────

const cutoffs = RANK_THRESHOLDS.map(r => ({
    tier:     r.tier,
    division: r.division,
    label:    r.division ? `${r.tier} ${r.division}` : r.tier,
    minScore: Math.max(0, Math.round(topPercentToScore(r.topPercent, anchors))),
}))

// ── Render Lua ───────────────────────────────────────────────────────────────

const luaNull   = 'nil'
const luaStr    = v => `"${v}"`
const luaDiv    = d => d ? luaStr(d) : luaNull
const pad       = (s, n) => s.padEnd(n)

const anchorRows = anchors
    .map(a => `    { topPercent = ${String(a.topPercent).padEnd(4)}, score = ${a.score} },`)
    .join('\n')

const cutoffRows = cutoffs.map((c, i) => {
    const tierCol  = pad(luaStr(c.tier),  pad(luaStr('Grandmaster'), 0).length)
    const divCol   = pad(luaDiv(c.division), luaStr('III').length)
    const labelCol = pad(luaStr(c.label), luaStr('Grandmaster III').length)
    const pct      = RANK_THRESHOLDS[i].topPercent
    return `    { tier = ${tierCol}, division = ${divCol}, label = ${labelCol}, minScore = ${String(c.minScore).padStart(4)}, topPercent = ${String(pct).padStart(6)} },`
}).join('\n')

const lua = `-- AUTO-GENERATED by scripts/generate-rank-data.mjs — do not edit by hand.
-- Regenerated weekly from live Raider.io season-cutoffs data.

TankMeLater = TankMeLater or {}
TankMeLater.Data = {}

-- Season metadata
TankMeLater.Data.Season      = "${season}"
TankMeLater.Data.UpdatedDate = "${today}"

-- Raw percentile anchors used to derive the cutoffs below.
TankMeLater.Data.Anchors = {
${anchorRows}
}

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
