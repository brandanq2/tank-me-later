export type Status = 'safe' | 'risk' | 'despair'

export const SAFE_MARGIN = 15    // >= this far above cutoff → safe
export const DESPAIR_MARGIN = 15 // >= this far below cutoff → despair

// Blizzard truncates the cutoff to an integer when awarding the title, so the
// effective title threshold is the floored value.
export function effectiveCutoff(raw: number): number {
  return Math.floor(raw)
}

export function statusOf(margin: number): Status {
  if (margin >= SAFE_MARGIN) return 'safe'
  if (margin <= -DESPAIR_MARGIN) return 'despair'
  return 'risk'
}

export const STATUS_META: Record<Status, { label: string; icon: string }> = {
  safe: { label: 'SAFE', icon: '🛡️' },
  risk: { label: 'AT RISK', icon: '⚠️' },
  despair: { label: 'DESPAIR', icon: '💀' },
}

export const CLASS_COLORS: Record<string, string> = {
  'Death Knight': '#C41E3A',
  'Demon Hunter': '#A330C9',
  Druid: '#FF7C0A',
  Evoker: '#33937F',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Monk: '#00FF98',
  Paladin: '#F48CBA',
  Priest: '#FFFFFF',
  Rogue: '#FFF468',
  Shaman: '#0070DD',
  Warlock: '#8788EE',
  Warrior: '#C69B3A',
}

export function classColor(className?: string): string {
  return className ? CLASS_COLORS[className] ?? '#aaa' : '#aaa'
}
