import { specIconUrl } from '../../midnight/specIcons'
import type { CharacterLook } from '../../midnight/useCharacterLooks'

interface Props {
  look?: CharacterLook
}

/**
 * Spec icon for a fetched character. Holds its square while loading so the
 * roster does not reflow as raider.io answers, and degrades to a plain
 * placeholder for characters that failed to load or whose spec is unknown.
 */
export function SpecIcon({ look }: Props) {
  const url = specIconUrl(look?.className, look?.specName)

  if (!url) {
    const title = look?.status === 'error' ? 'Character not found on raider.io' : undefined
    return <span className="mn-spec-icon mn-spec-icon-empty" title={title} aria-hidden />
  }

  return (
    <img
      className="mn-spec-icon"
      src={url}
      alt=""
      title={`${look?.specName} ${look?.className}`}
      loading="lazy"
      aria-hidden
    />
  )
}
