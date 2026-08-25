/**
 * Spec icons, keyed by class *and* spec because spec names collide across
 * classes — Holy is both Paladin and Priest, Frost is both Mage and Death
 * Knight, Protection is both Paladin and Warrior, and so on.
 *
 * Slugs are Wowhead's, served off their CDN, and every entry here was checked
 * to return 200. A spec Blizzard adds later falls back to its class icon rather
 * than a blank square — Midnight already caught us out once with Devourer.
 */

const ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/medium'

/** Fallback for a known class whose spec we do not recognise yet. */
const CLASS_ICONS: Record<string, string> = {
  'Death Knight': 'classicon_deathknight',
  'Demon Hunter': 'classicon_demonhunter',
  Druid: 'classicon_druid',
  Evoker: 'classicon_evoker',
  Hunter: 'classicon_hunter',
  Mage: 'classicon_mage',
  Monk: 'classicon_monk',
  Paladin: 'classicon_paladin',
  Priest: 'classicon_priest',
  Rogue: 'classicon_rogue',
  Shaman: 'classicon_shaman',
  Warlock: 'classicon_warlock',
  Warrior: 'classicon_warrior',
}

const SPEC_ICONS: Record<string, string> = {
  'Death Knight:Blood': 'spell_deathknight_bloodpresence',
  'Death Knight:Frost': 'spell_deathknight_frostpresence',
  'Death Knight:Unholy': 'spell_deathknight_unholypresence',
  'Demon Hunter:Havoc': 'ability_demonhunter_specdps',
  'Demon Hunter:Vengeance': 'ability_demonhunter_spectank',
  // Midnight's third DH spec. Blizzard named the icon for the Void theme
  // rather than the spec, so it is not guessable from the spec name.
  'Demon Hunter:Devourer': 'classicon_demonhunter_void',
  'Druid:Balance': 'spell_nature_starfall',
  'Druid:Feral': 'ability_druid_catform',
  'Druid:Guardian': 'ability_racial_bearform',
  'Druid:Restoration': 'spell_nature_healingtouch',
  'Evoker:Devastation': 'classicon_evoker_devastation',
  'Evoker:Preservation': 'classicon_evoker_preservation',
  'Evoker:Augmentation': 'classicon_evoker_augmentation',
  'Hunter:Beast Mastery': 'ability_hunter_bestialdiscipline',
  'Hunter:Marksmanship': 'ability_hunter_focusedaim',
  'Hunter:Survival': 'ability_hunter_camouflage',
  'Mage:Arcane': 'spell_holy_magicalsentry',
  'Mage:Fire': 'spell_fire_firebolt02',
  'Mage:Frost': 'spell_frost_frostbolt02',
  'Monk:Brewmaster': 'spell_monk_brewmaster_spec',
  'Monk:Mistweaver': 'spell_monk_mistweaver_spec',
  'Monk:Windwalker': 'spell_monk_windwalker_spec',
  'Paladin:Holy': 'spell_holy_holybolt',
  'Paladin:Protection': 'ability_paladin_shieldofthetemplar',
  'Paladin:Retribution': 'spell_holy_auraoflight',
  'Priest:Discipline': 'spell_holy_powerwordshield',
  'Priest:Holy': 'spell_holy_guardianspirit',
  'Priest:Shadow': 'spell_shadow_shadowwordpain',
  'Rogue:Assassination': 'ability_rogue_deadlybrew',
  'Rogue:Outlaw': 'inv_sword_30',
  'Rogue:Subtlety': 'ability_stealth',
  'Shaman:Elemental': 'spell_nature_lightning',
  'Shaman:Enhancement': 'spell_shaman_improvedstormstrike',
  'Shaman:Restoration': 'spell_nature_magicimmunity',
  'Warlock:Affliction': 'spell_shadow_deathcoil',
  'Warlock:Demonology': 'spell_shadow_metamorphosis',
  'Warlock:Destruction': 'spell_shadow_rainoffire',
  'Warrior:Arms': 'ability_warrior_savageblow',
  'Warrior:Fury': 'ability_warrior_innerrage',
  'Warrior:Protection': 'ability_warrior_defensivestance',
}

/**
 * Prefers the spec icon, falls back to the class icon, and only returns null
 * when the class itself is unknown — so a character that loaded always shows
 * something, even on a spec that shipped after this map was written.
 */
export function specIconUrl(characterClass?: string, specName?: string): string | null {
  if (!characterClass) return null
  const slug = (specName && SPEC_ICONS[`${characterClass}:${specName}`])
    || CLASS_ICONS[characterClass]
  return slug ? `${ICON_BASE}/${slug}.jpg` : null
}
