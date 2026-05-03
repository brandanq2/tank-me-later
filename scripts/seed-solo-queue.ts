import { Redis } from '@upstash/redis'
import { config } from 'dotenv'

config({ path: '.env.local' })

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

type Division = 'I' | 'II' | 'III' | 'IV' | null
interface ScoreAnchor { topPercent: number; score: number }

const RANK_THRESHOLDS = [
  { tier: 'Challenger',  division: null  as Division, topPercent: 0.03  },
  { tier: 'Grandmaster', division: null  as Division, topPercent: 0.1   },
  { tier: 'Master',      division: null  as Division, topPercent: 0.5   },
  { tier: 'Diamond',     division: 'I'   as Division, topPercent: 1.0   },
  { tier: 'Diamond',     division: 'II'  as Division, topPercent: 1.3   },
  { tier: 'Diamond',     division: 'III' as Division, topPercent: 1.7   },
  { tier: 'Diamond',     division: 'IV'  as Division, topPercent: 3.1   },
  { tier: 'Emerald',     division: 'I'   as Division, topPercent: 4.0   },
  { tier: 'Emerald',     division: 'II'  as Division, topPercent: 5.4   },
  { tier: 'Emerald',     division: 'III' as Division, topPercent: 7.0   },
  { tier: 'Emerald',     division: 'IV'  as Division, topPercent: 9.0   },
  { tier: 'Platinum',    division: 'I'   as Division, topPercent: 11.0  },
  { tier: 'Platinum',    division: 'II'  as Division, topPercent: 13.0  },
  { tier: 'Platinum',    division: 'III' as Division, topPercent: 15.0  },
  { tier: 'Platinum',    division: 'IV'  as Division, topPercent: 17.7  },
  { tier: 'Gold',        division: 'I'   as Division, topPercent: 20.0  },
  { tier: 'Gold',        division: 'II'  as Division, topPercent: 22.0  },
  { tier: 'Gold',        division: 'III' as Division, topPercent: 24.0  },
  { tier: 'Gold',        division: 'IV'  as Division, topPercent: 26.4  },
  { tier: 'Silver',      division: 'I'   as Division, topPercent: 32.0  },
  { tier: 'Silver',      division: 'II'  as Division, topPercent: 38.0  },
  { tier: 'Silver',      division: 'III' as Division, topPercent: 44.0  },
  { tier: 'Silver',      division: 'IV'  as Division, topPercent: 51.8  },
  { tier: 'Bronze',      division: 'I'   as Division, topPercent: 58.0  },
  { tier: 'Bronze',      division: 'II'  as Division, topPercent: 64.0  },
  { tier: 'Bronze',      division: 'III' as Division, topPercent: 70.0  },
  { tier: 'Bronze',      division: 'IV'  as Division, topPercent: 77.0  },
  { tier: 'Iron',        division: 'I'   as Division, topPercent: 84.0  },
  { tier: 'Iron',        division: 'II'  as Division, topPercent: 88.0  },
  { tier: 'Iron',        division: 'III' as Division, topPercent: 92.0  },
  { tier: 'Iron',        division: 'IV'  as Division, topPercent: 100.0 },
]

function topPercentToScore(topPercent: number, anchors: ScoreAnchor[]): number {
  const pts = [...anchors].sort((a, b) => a.topPercent - b.topPercent)
  const top = pts[0], bottom = pts[pts.length - 1]
  if (topPercent <= top.topPercent) {
    const slope = (pts[1].score - top.score) / (pts[1].topPercent - top.topPercent)
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

async function main() {
  console.log('Fetching Raider.io season cutoffs...')
  const res = await fetch('https://raider.io/api/v1/mythic-plus/season-cutoffs?season=season-tww-2&region=us')
  if (!res.ok) throw new Error(`Raider.io returned ${res.status}`)
  const data = await res.json()

  const cutoffs = data?.cutoffs ?? data
  const keys: Array<[string, number]> = [
    ['p999', 0.1], ['p990', 1.0], ['p900', 10.0], ['p750', 25.0], ['p600', 40.0],
  ]
  const anchors: ScoreAnchor[] = []
  for (const [key, topPercent] of keys) {
    const score = cutoffs?.[key]?.all?.quantileMinValue
    if (typeof score === 'number') anchors.push({ topPercent, score })
  }

  if (anchors.length < 3) throw new Error(`Only got ${anchors.length} anchors — check Raider.io response`)
  console.log(`Got ${anchors.length} anchors:`, anchors.map(a => `${a.topPercent}% → ${a.score}`).join(', '))

  const ranks = RANK_THRESHOLDS.map(r => ({
    tier: r.tier,
    division: r.division,
    label: r.division ? `${r.tier} ${r.division}` : r.tier,
    minScore: Math.max(0, Math.round(topPercentToScore(r.topPercent, anchors))),
    topPercent: r.topPercent,
  }))

  const mapping = { updatedAt: new Date().toISOString(), season: 'season-tww-2', region: 'us', ranks }

  await redis.set('tank-me-later:solo-queue-mapping', mapping)
  console.log(`Stored mapping with ${ranks.length} ranks. Top 5:`)
  ranks.slice(0, 5).forEach(r => console.log(`  ${r.label.padEnd(16)} ≥ ${r.minScore}`))
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
