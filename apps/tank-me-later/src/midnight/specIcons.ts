/**
 * Spec icons, keyed by class *and* spec because spec names collide across
 * classes — Holy is both Paladin and Priest, Frost is both Mage and Death
 * Knight, Protection is both Paladin and Warrior, and so on.
 *
 * Slugs are Wowhead's, served off their CDN. Every entry here was checked to
 * return 200; anything Blizzard adds later falls through to a neutral
 * placeholder rather than a broken image.
 */

const ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/medium'

const SPEC_ICONS: Record<string, string> = {
  'Death Knight:Blood': 'spell_deathknight_bloodpresence',
  'Death Knight:Frost': 'spell_deathknight_frostpresence',
  'Death Knight:Unholy': 'spell_deathknight_unholypresence',
  'Demon Hunter:Havoc': 'ability_demonhunter_specdps',
  'Demon Hunter:Vengeance': 'ability_demonhunter_spectank',
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

/** null when the class/spec pair is unknown, so callers can show a placeholder. */
export function specIconUrl(characterClass?: string, specName?: string): string | null {
  if (!characterClass || !specName) return null
  const slug = SPEC_ICONS[`${characterClass}:${specName}`]
  return slug ? `${ICON_BASE}/${slug}.jpg` : null
}
