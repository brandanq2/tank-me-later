// Color stops matching raider.io's score gradient: grey → green → blue → purple → orange
const STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0,    rgb: [157, 157, 157] }, // grey
  { t: 0.25, rgb: [30,  255,   0] }, // green
  { t: 0.5,  rgb: [0,  112, 255]  }, // blue
  { t: 0.75, rgb: [163,  53, 238] }, // purple
  { t: 1,    rgb: [255, 128,   0] }, // orange (legendary)
]

function lerp(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

export function scoreToColor(score: number, min: number, max: number): string {
  const t = max === min ? 1 : (score - min) / (max - min)
  const clamped = Math.max(0, Math.min(1, t))

  for (let i = 0; i < STOPS.length - 1; i++) {
    const lo = STOPS[i]
    const hi = STOPS[i + 1]
    if (clamped <= hi.t) {
      const localT = (clamped - lo.t) / (hi.t - lo.t)
      return lerp(lo.rgb, hi.rgb, localT)
    }
  }

  return lerp(STOPS[STOPS.length - 2].rgb, STOPS[STOPS.length - 1].rgb, 1)
}
