import { Redis } from '@upstash/redis'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

type Division = 'I' | 'II' | 'III' | 'IV' | null

interface ScoreAnchor { topPercent: number; score: number }

interface RankThreshold { tier: string; division: Division; topPercent: number }

export interface RankCutoff {
  tier: string
  division: Division
  label: string
  minScore: number
  topPercent: number
}

const RANK_THRESHOLDS: RankThreshold[] = [
  { tier: 'Challenger',  division: null,  topPercent: 0.03  },
  { tier: 'Grandmaster', division: null,  topPercent: 0.1   },
  { tier: 'Master',      division: null,  topPercent: 0.5   },
  { tier: 'Diamond',     division: 'I',   topPercent: 1.0   },
  { tier: 'Diamond',     division: 'II',  topPercent: 1.3   },
  { tier: 'Diamond',     division: 'III', topPercent: 1.7   },
  { tier: 'Diamond',     division: 'IV',  topPercent: 3.1   },
  { tier: 'Emerald',     division: 'I',   topPercent: 4.0   },
  { tier: 'Emerald',     division: 'II',  topPercent: 5.4   },
  { tier: 'Emerald',     division: 'III', topPercent: 7.0   },
  { tier: 'Emerald',     division: 'IV',  topPercent: 9.0   },
  { tier: 'Platinum',    division: 'I',   topPercent: 11.0  },
  { tier: 'Platinum',    division: 'II',  topPercent: 13.0  },
  { tier: 'Platinum',    division: 'III', topPercent: 15.0  },
  { tier: 'Platinum',    division: 'IV',  topPercent: 17.7  },
  { tier: 'Gold',        division: 'I',   topPercent: 20.0  },
  { tier: 'Gold',        division: 'II',  topPercent: 22.0  },
  { tier: 'Gold',        division: 'III', topPercent: 24.0  },
  { tier: 'Gold',        division: 'IV',  topPercent: 26.4  },
  { tier: 'Silver',      division: 'I',   topPercent: 32.0  },
  { tier: 'Silver',      division: 'II',  topPercent: 38.0  },
  { tier: 'Silver',      division: 'III', topPercent: 44.0  },
  { tier: 'Silver',      division: 'IV',  topPercent: 51.8  },
  { tier: 'Bronze',      division: 'I',   topPercent: 58.0  },
  { tier: 'Bronze',      division: 'II',  topPercent: 64.0  },
  { tier: 'Bronze',      division: 'III', topPercent: 70.0  },
  { tier: 'Bronze',      division: 'IV',  topPercent: 77.0  },
  { tier: 'Iron',        division: 'I',   topPercent: 84.0  },
  { tier: 'Iron',        division: 'II',  topPercent: 88.0  },
  { tier: 'Iron',        division: 'III', topPercent: 92.0  },
  { tier: 'Iron',        division: 'IV',  topPercent: 100.0 },
]

function topPercentToScore(topPercent: number, anchors: ScoreAnchor[]): number {
  const pts = [...anchors].sort((a, b) => a.topPercent - b.topPercent)
  const top = pts[0]
  const bottom = pts[pts.length - 1]

  if (topPercent <= top.topPercent) {
    const next = pts[1]
    const slope = (next.score - top.score) / (next.topPercent - top.topPercent)
    return top.score + (topPercent - top.topPercent) * slope
  }

  if (topPercent >= bottom.topPercent) {
    const prev = pts[pts.length - 2]
    const slope = (bottom.score - prev.score) / (bottom.topPercent - prev.topPercent)
    return Math.max(0, bottom.score + (topPercent - bottom.topPercent) * slope)
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

function extractAnchors(data: unknown): ScoreAnchor[] {
  const d = data as Record<string, unknown>
  const cutoffs = (d?.cutoffs ?? d) as Record<string, unknown>
  const keys: Array<[string, number]> = [
    ['p999', 0.1], ['p990', 1.0], ['p900', 10.0], ['p750', 25.0], ['p600', 40.0],
  ]
  const anchors: ScoreAnchor[] = []
  for (const [key, topPercent] of keys) {
    const entry = cutoffs?.[key] as Record<string, unknown> | undefined
    const score = (entry?.all as Record<string, unknown> | undefined)?.quantileMinValue
    if (typeof score === 'number') anchors.push({ topPercent, score })
  }
  return anchors
}

function computeRankCutoffs(anchors: ScoreAnchor[]): RankCutoff[] {
  return RANK_THRESHOLDS.map(r => ({
    tier: r.tier,
    division: r.division,
    label: r.division ? `${r.tier} ${r.division}` : r.tier,
    minScore: Math.max(0, Math.round(topPercentToScore(r.topPercent, anchors))),
    topPercent: r.topPercent,
  }))
}

export const REDIS_KEY = 'tank-me-later:solo-queue-mapping'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end()
  }

  const CANDIDATES = ['season-mn-1', 'season-tww-3', 'season-tww-2']
  let anchors: ScoreAnchor[] = []
  let activeSeason = ''

  for (const slug of CANDIDATES) {
    const r = await fetch(
      `https://raider.io/api/v1/mythic-plus/season-cutoffs?season=${slug}&region=us`
    )
    if (!r.ok) continue
    const a = extractAnchors(await r.json())
    if (a.length >= 3) { anchors = a; activeSeason = slug; break }
  }

  if (!activeSeason) {
    return res.status(502).json({ error: 'No live season found on Raider.io' })
  }

  const mapping = {
    updatedAt: new Date().toISOString(),
    season: activeSeason,
    region: 'us',
    ranks: computeRankCutoffs(anchors),
  }

  await redis.set(REDIS_KEY, mapping)

  return res.json({ ok: true, updatedAt: mapping.updatedAt, ranks: mapping.ranks.length })
}
