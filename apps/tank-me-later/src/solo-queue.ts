// Rank distribution based on 2024-2025 LoL season data.
// topPercent = upper boundary of the rank bucket (from the top of the player base).
// e.g., if your estimated top-% is <= 0.03, you're Challenger.

export type Division = 'I' | 'II' | 'III' | 'IV' | null

export interface Rank {
  tier: string
  division: Division
  label: string
}

export interface ScoreAnchor {
  topPercent: number // e.g. 0.1 means "top 0.1%"
  score: number
}

const RANK_THRESHOLDS: Array<{ tier: string; division: Division; topPercent: number }> = [
  { tier: 'Challenger',  division: null,  topPercent: 0.03 },
  { tier: 'Grandmaster', division: null,  topPercent: 0.1  },
  { tier: 'Master',      division: null,  topPercent: 0.5  },
  { tier: 'Diamond',     division: 'I',   topPercent: 1.0  },
  { tier: 'Diamond',     division: 'II',  topPercent: 1.3  },
  { tier: 'Diamond',     division: 'III', topPercent: 1.7  },
  { tier: 'Diamond',     division: 'IV',  topPercent: 3.1  },
  { tier: 'Emerald',     division: 'I',   topPercent: 4.0  },
  { tier: 'Emerald',     division: 'II',  topPercent: 5.4  },
  { tier: 'Emerald',     division: 'III', topPercent: 7.0  },
  { tier: 'Emerald',     division: 'IV',  topPercent: 9.0  },
  { tier: 'Platinum',    division: 'I',   topPercent: 11.0 },
  { tier: 'Platinum',    division: 'II',  topPercent: 13.0 },
  { tier: 'Platinum',    division: 'III', topPercent: 15.0 },
  { tier: 'Platinum',    division: 'IV',  topPercent: 17.7 },
  { tier: 'Gold',        division: 'I',   topPercent: 20.0 },
  { tier: 'Gold',        division: 'II',  topPercent: 22.0 },
  { tier: 'Gold',        division: 'III', topPercent: 24.0 },
  { tier: 'Gold',        division: 'IV',  topPercent: 26.4 },
  { tier: 'Silver',      division: 'I',   topPercent: 32.0 },
  { tier: 'Silver',      division: 'II',  topPercent: 38.0 },
  { tier: 'Silver',      division: 'III', topPercent: 44.0 },
  { tier: 'Silver',      division: 'IV',  topPercent: 51.8 },
  { tier: 'Bronze',      division: 'I',   topPercent: 58.0 },
  { tier: 'Bronze',      division: 'II',  topPercent: 64.0 },
  { tier: 'Bronze',      division: 'III', topPercent: 70.0 },
  { tier: 'Bronze',      division: 'IV',  topPercent: 77.0 },
  { tier: 'Iron',        division: 'I',   topPercent: 84.0 },
  { tier: 'Iron',        division: 'II',  topPercent: 88.0 },
  { tier: 'Iron',        division: 'III', topPercent: 92.0 },
  { tier: 'Iron',        division: 'IV',  topPercent: 100.0 },
]

// Linearly interpolate a score to an estimated top-% using Raider.io anchor points.
// anchors must include at least two entries; sorted order doesn't matter.
function scoreToTopPercent(score: number, anchors: ScoreAnchor[]): number {
  const pts = [...anchors].sort((a, b) => a.topPercent - b.topPercent)
  // pts[0] = highest score (smallest topPercent), pts[last] = lowest score (largest topPercent)

  const top = pts[0]
  const bottom = pts[pts.length - 1]

  if (score >= top.score) {
    // Extrapolate above the highest anchor
    if (pts.length >= 2) {
      const next = pts[1]
      const slope = (next.topPercent - top.topPercent) / (top.score - next.score)
      return Math.max(0, top.topPercent - (score - top.score) * slope)
    }
    return 0
  }

  if (score <= bottom.score) {
    // Extrapolate below the lowest anchor
    if (pts.length >= 2) {
      const prev = pts[pts.length - 2]
      const slope = (bottom.topPercent - prev.topPercent) / (prev.score - bottom.score)
      return Math.min(100, bottom.topPercent + (bottom.score - score) * slope)
    }
    return 100
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const hi = pts[i]
    const lo = pts[i + 1]
    if (score <= hi.score && score >= lo.score) {
      const t = (score - lo.score) / (hi.score - lo.score)
      return lo.topPercent - t * (lo.topPercent - hi.topPercent)
    }
  }

  return 100
}

export function scoreToRank(score: number, anchors: ScoreAnchor[]): Rank {
  if (anchors.length === 0) return { tier: 'Unranked', division: null, label: 'Unranked' }

  const topPercent = scoreToTopPercent(score, anchors)

  for (const r of RANK_THRESHOLDS) {
    if (topPercent <= r.topPercent) {
      const label = r.division ? `${r.tier} ${r.division}` : r.tier
      return { tier: r.tier, division: r.division, label }
    }
  }

  return { tier: 'Iron', division: 'IV', label: 'Iron IV' }
}

// Inverse of scoreToTopPercent: given a topPercent boundary, return the minimum score for that rank.
function topPercentToScore(topPercent: number, anchors: ScoreAnchor[]): number {
  const pts = [...anchors].sort((a, b) => a.topPercent - b.topPercent)
  const top = pts[0]
  const bottom = pts[pts.length - 1]

  if (topPercent <= top.topPercent) {
    if (pts.length >= 2) {
      const next = pts[1]
      const slope = (next.score - top.score) / (next.topPercent - top.topPercent)
      return top.score + (topPercent - top.topPercent) * slope
    }
    return top.score
  }

  if (topPercent >= bottom.topPercent) {
    if (pts.length >= 2) {
      const prev = pts[pts.length - 2]
      const slope = (bottom.score - prev.score) / (bottom.topPercent - prev.topPercent)
      return Math.max(0, bottom.score + (topPercent - bottom.topPercent) * slope)
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

export interface RankCutoff {
  tier: string
  division: Division
  label: string
  minScore: number
  topPercent: number
}

export function getRankCutoffs(anchors: ScoreAnchor[]): RankCutoff[] {
  return RANK_THRESHOLDS.map(r => ({
    tier: r.tier,
    division: r.division,
    label: r.division ? `${r.tier} ${r.division}` : r.tier,
    minScore: Math.max(0, Math.round(topPercentToScore(r.topPercent, anchors))),
    topPercent: r.topPercent,
  }))
}

// Simpler lookup against pre-computed cutoffs (from the weekly cron).
// cutoffs must be ordered highest-rank-first (Challenger index 0).
export function scoreToRankFromCutoffs(score: number, cutoffs: RankCutoff[]): Rank {
  if (cutoffs.length === 0) return { tier: 'Unranked', division: null, label: 'Unranked' }
  for (const c of cutoffs) {
    if (score >= c.minScore) return { tier: c.tier, division: c.division, label: c.label }
  }
  return { tier: 'Iron', division: 'IV', label: 'Iron IV' }
}

export function getNextRankInfoFromCutoffs(
  score: number,
  cutoffs: RankCutoff[],
): { nextRank: Rank; pointsNeeded: number } | null {
  if (cutoffs.length === 0) return null

  let currentIdx = cutoffs.length - 1
  for (let i = 0; i < cutoffs.length; i++) {
    if (score >= cutoffs[i].minScore) { currentIdx = i; break }
  }

  if (currentIdx === 0) return null

  const next = cutoffs[currentIdx - 1]
  const pointsNeeded = Math.ceil(next.minScore - score)
  if (pointsNeeded <= 0) return null

  return { nextRank: { tier: next.tier, division: next.division, label: next.label }, pointsNeeded }
}

export function getNextRankInfo(
  score: number,
  anchors: ScoreAnchor[],
): { nextRank: Rank; pointsNeeded: number } | null {
  if (anchors.length === 0) return null

  const topPercent = scoreToTopPercent(score, anchors)

  let currentIdx = RANK_THRESHOLDS.length - 1
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (topPercent <= RANK_THRESHOLDS[i].topPercent) {
      currentIdx = i
      break
    }
  }

  if (currentIdx === 0) return null

  const next = RANK_THRESHOLDS[currentIdx - 1]
  const pointsNeeded = Math.ceil(topPercentToScore(next.topPercent, anchors) - score)
  if (pointsNeeded <= 0) return null

  const label = next.division ? `${next.tier} ${next.division}` : next.tier
  return { nextRank: { tier: next.tier, division: next.division, label }, pointsNeeded }
}

// Parse the 5 percentile anchors out of a Raider.io season-cutoffs API response.
export function extractAnchors(data: unknown): ScoreAnchor[] {
  const d = data as Record<string, unknown>
  const cutoffs = (d?.cutoffs ?? d) as Record<string, unknown>

  const keys: Array<[string, number]> = [
    ['p999', 0.1],
    ['p990', 1.0],
    ['p900', 10.0],
    ['p750', 25.0],
    ['p600', 40.0],
  ]

  const anchors: ScoreAnchor[] = []
  for (const [key, topPercent] of keys) {
    const entry = cutoffs?.[key] as Record<string, unknown> | undefined
    const all = entry?.all as Record<string, unknown> | undefined
    const score = all?.quantileMinValue
    if (typeof score === 'number') {
      anchors.push({ topPercent, score })
    }
  }

  return anchors
}
