import { useState, type FormEvent } from 'react'
import type { CharacterInput } from '../types'

interface Props {
  onAdd: (char: CharacterInput) => void
  loading: boolean
}

const REGIONS = ['us', 'eu', 'kr', 'tw', 'cn']

const REALMS: Record<string, string[]> = {
  us: [
    'area-52', 'illidan', 'stormrage', 'proudmoore', 'mal-ganis',
    'tichondrius', 'bleeding-hollow', 'sargeras', 'zuljin', 'thrall',
    'khadgar', 'barthilas', 'frostmourne', 'moon-guard', 'wyrmrest-accord',
    'whisperwind', 'earthen-ring', 'kiljaeden', 'eredar', 'blackrock',
    'hyjal', 'lightbringer', 'emerald-dream', 'ysera', 'zul-jin',
    'turalyon', 'windrunner', 'icecrown', 'durotan', 'dalaran',
    'greymane', 'alexstrasza', 'malfurion', 'trollbane', 'echo-isles',
    'elune', 'stormreaver', 'ursin', 'laughing-skull', 'deathwing',
    'darkspear', 'kel-thuzad', 'arthas', 'mannoroth', 'destromath',
    'garona', 'garrosh', 'ner-zhul', 'burning-blade', 'shadow-council',
    'silvermoon', 'sen-jin', 'sisters-of-elune', 'uther', 'dragonmaw',
    'bonechewer', 'spinebreaker', 'muradin', 'azgalor', 'frostwolf',
    'skullcrusher', 'shattered-halls', 'bleeding-hollow', 'norgannon',
    'cenarion-circle', 'bronzebeard', 'doomhammer', 'bloodhoof',
    'farstriders', 'feathermoon', 'kirin-tor', 'steamwheedle-cartel',
    'thorium-brotherhood', 'silver-hand', 'scarlet-crusade',
    'ravenholdt', 'blackwater-raiders', 'the-venture-co',
  ],
  eu: [
    'twisting-nether', 'tarren-mill', 'kazzak', 'draenor', 'ravencrest',
    'sylvanas', 'stormscale', 'defias-brotherhood', 'argent-dawn',
    'chamber-of-aspects', 'outland', 'ragnaros', 'aegwynn', 'antonidas',
    'blackhand', 'eredar', 'frostmane', 'kel-thuzad', 'nera-zhul',
    'azshara', 'gul-dan', 'mal-ganis', 'destromath', 'blackrock',
    'alleria', 'lothar', 'madmortem', 'die-silberne-hand', 'zirkel-des-cenarius',
    'crushridge', 'drak-thul', 'laughing-skull', 'spinebreaker',
    'twilights-hammer', 'deathwing', 'bloodfeather', 'darksorrow',
    'genjuros', 'neptulon', 'shattered-halls', 'skullcrusher', 'boulderfist',
  ],
  kr: [
    'azshara', 'burning-legion', 'alexstrasza', 'norgannon', 'deathwing',
    'hyjal', 'stormrage', 'windrunner', 'dalaran',
  ],
  tw: [
    'wrathbringer', 'chillwind-point', 'arygos', 'bleeding-hollow',
    'icecrown', 'light-sorrow', 'nightsong', 'silverwing-hold',
    'stormrage', 'sundown-marsh',
  ],
  cn: [],
}

export function AddCharacterForm({ onAdd, loading }: Props) {
  const [name, setName] = useState('')
  const [realm, setRealm] = useState('')
  const [region, setRegion] = useState('us')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedRealm = realm.trim()
    if (!trimmedName || !trimmedRealm) return
    onAdd({ name: trimmedName, realm: trimmedRealm, region })
    setName('')
    setRealm('')
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Character name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={loading}
        required
      />
      <input
        type="text"
        placeholder="Realm (e.g. illidan)"
        value={realm}
        onChange={(e) => setRealm(e.target.value)}
        disabled={loading}
        list="realm-suggestions"
        autoComplete="off"
        required
      />
      <datalist id="realm-suggestions">
        {(REALMS[region] ?? []).map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={loading}>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {r.toUpperCase()}
          </option>
        ))}
      </select>
      <button type="submit" disabled={loading || !name.trim() || !realm.trim()}>
        Add
      </button>
    </form>
  )
}
