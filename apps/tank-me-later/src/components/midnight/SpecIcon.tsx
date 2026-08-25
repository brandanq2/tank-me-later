import { specIconUrl } from '../../midnight/specIcons'

interface Props {
  characterClass?: string
  specName?: string
  /** Shown on hover when there is nothing to draw. */
  emptyTitle?: string
}

/**
 * Spec icon for a class/spec pair. Holds its square when there is nothing to
 * draw so rosters do not reflow as raider.io answers, and falls back to the
 * class icon for specs that postdate the icon map.
 */
export function SpecIcon({ characterClass, specName, emptyTitle }: Props) {
  const url = specIconUrl(characterClass, specName)

  if (!url) {
    return <span className="mn-spec-icon mn-spec-icon-empty" title={emptyTitle} aria-hidden />
  }

  return (
    <img
      className="mn-spec-icon"
      src={url}
      alt=""
      title={specName ? `${specName} ${characterClass}` : characterClass}
      loading="lazy"
      aria-hidden
    />
  )
}
