/**
 * Class and spec taxonomy for raid signups.
 *
 * This is the source of truth for two things the roster needs: which section a
 * signup belongs in (tank / healer / melee / ranged), and which raid buffs a
 * class brings. Specs are listed per class because the names collide — Frost is
 * ranged on a Mage and melee on a Death Knight, so a spec name alone is not
 * enough to place someone.
 */

export type RaidRole = 'tank' | 'healer' | 'melee' | 'ranged'

/** Display order of the roster sections. */
export const RAID_ROLES: RaidRole[] = ['tank', 'healer', 'melee', 'ranged']

export const ROLE_LABELS: Record<RaidRole, string> = {
  tank: 'Tanks',
  healer: 'Healers',
  melee: 'Melee DPS',
  ranged: 'Ranged DPS',
}

export interface SpecInfo {
  name: string
  role: RaidRole
}

export const CLASS_SPECS: Record<string, SpecInfo[]> = {
  'Death Knight': [
    { name: 'Blood', role: 'tank' },
    { name: 'Frost', role: 'melee' },
    { name: 'Unholy', role: 'melee' },
  ],
  'Demon Hunter': [
    { name: 'Havoc', role: 'melee' },
    { name: 'Vengeance', role: 'tank' },
    // Midnight's Void spec — DH has no ranged spec, so melee.
    { name: 'Devourer', role: 'melee' },
  ],
  Druid: [
    { name: 'Balance', role: 'ranged' },
    { name: 'Feral', role: 'melee' },
    { name: 'Guardian', role: 'tank' },
    { name: 'Restoration', role: 'healer' },
  ],
  Evoker: [
    { name: 'Devastation', role: 'ranged' },
    { name: 'Preservation', role: 'healer' },
    { name: 'Augmentation', role: 'ranged' },
  ],
  Hunter: [
    { name: 'Beast Mastery', role: 'ranged' },
    { name: 'Marksmanship', role: 'ranged' },
    { name: 'Survival', role: 'melee' },
  ],
  Mage: [
    { name: 'Arcane', role: 'ranged' },
    { name: 'Fire', role: 'ranged' },
    { name: 'Frost', role: 'ranged' },
  ],
  Monk: [
    { name: 'Brewmaster', role: 'tank' },
    { name: 'Mistweaver', role: 'healer' },
    { name: 'Windwalker', role: 'melee' },
  ],
  Paladin: [
    { name: 'Holy', role: 'healer' },
    { name: 'Protection', role: 'tank' },
    { name: 'Retribution', role: 'melee' },
  ],
  Priest: [
    { name: 'Discipline', role: 'healer' },
    { name: 'Holy', role: 'healer' },
    { name: 'Shadow', role: 'ranged' },
  ],
  Rogue: [
    { name: 'Assassination', role: 'melee' },
    { name: 'Outlaw', role: 'melee' },
    { name: 'Subtlety', role: 'melee' },
  ],
  Shaman: [
    { name: 'Elemental', role: 'ranged' },
    { name: 'Enhancement', role: 'melee' },
    { name: 'Restoration', role: 'healer' },
  ],
  Warlock: [
    { name: 'Affliction', role: 'ranged' },
    { name: 'Demonology', role: 'ranged' },
    { name: 'Destruction', role: 'ranged' },
  ],
  Warrior: [
    { name: 'Arms', role: 'melee' },
    { name: 'Fury', role: 'melee' },
    { name: 'Protection', role: 'tank' },
  ],
}

export const CLASSES: string[] = Object.keys(CLASS_SPECS)

/** Falls back to ranged so an unrecognised spec still lands in a section. */
export function specRole(characterClass?: string, specName?: string): RaidRole {
  const specs = characterClass ? CLASS_SPECS[characterClass] : undefined
  return specs?.find(s => s.name === specName)?.role ?? 'ranged'
}

export function isKnownSpec(characterClass?: string, specName?: string): boolean {
  if (!characterClass || !specName) return false
  return !!CLASS_SPECS[characterClass]?.some(s => s.name === specName)
}

/** Encodes a class/spec pair for a single <select> value. */
export function specValue(characterClass: string, specName: string): string {
  return `${characterClass}::${specName}`
}

export function parseSpecValue(value: string): { className: string; specName: string } | null {
  const [className, specName] = value.split('::')
  if (!className || !specName) return null
  return { className, specName }
}

/**
 * Raid-wide buffs and debuffs, and the classes that bring them. Any spec of the
 * class counts — these are all class-wide in the current game.
 *
 * Death Knight, Rogue and Warlock intentionally appear nowhere: they bring
 * utility rather than a raid-wide buff, so they are never a coverage gap.
 */
export interface RaidBuff {
  name: string
  /** Any one of these classes provides it. */
  classes: string[]
  /** Shown small next to the name. */
  note?: string
}

export const RAID_BUFFS: RaidBuff[] = [
  { name: 'Arcane Intellect', classes: ['Mage'], note: 'intellect' },
  { name: 'Power Word: Fortitude', classes: ['Priest'], note: 'stamina' },
  { name: 'Battle Shout', classes: ['Warrior'], note: 'attack power' },
  { name: 'Mark of the Wild', classes: ['Druid'], note: 'versatility' },
  { name: 'Skyfury', classes: ['Shaman'], note: 'mastery' },
  { name: 'Blessing of the Bronze', classes: ['Evoker'], note: 'movement' },
  { name: 'Devotion Aura', classes: ['Paladin'], note: 'damage reduction' },
  { name: 'Chaos Brand', classes: ['Demon Hunter'], note: '+magic damage taken' },
  { name: 'Mystic Touch', classes: ['Monk'], note: '+physical damage taken' },
  {
    name: 'Bloodlust / Heroism',
    classes: ['Shaman', 'Mage', 'Evoker', 'Hunter'],
    note: 'Time Warp · Fury of the Aspects · Primal Rage',
  },
]

export interface BuffCoverage {
  buff: RaidBuff
  /** Signed-up classes that cover it — empty means missing. */
  covered: string[]
}

export function buffCoverage(signedUpClasses: Iterable<string>): BuffCoverage[] {
  const present = new Set(signedUpClasses)
  return RAID_BUFFS.map(buff => ({
    buff,
    covered: buff.classes.filter(c => present.has(c)),
  }))
}
