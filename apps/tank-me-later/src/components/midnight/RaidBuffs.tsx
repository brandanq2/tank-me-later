import { classColor } from '@tml/shared/titleStatus'
import { buffCoverage } from '../../midnight/specs'
import type { SignupRecord } from '../../midnight/types'

interface Props {
  signups: SignupRecord[]
}

/**
 * Raid buff coverage for whoever has signed up. Buffs are class-wide, so this
 * only cares which classes are present, not which specs.
 */
export function RaidBuffs({ signups }: Props) {
  const present = new Set(signups.map(s => s.className).filter(Boolean))
  const coverage = buffCoverage(present)
  const missing = coverage.filter(c => c.covered.length === 0)
  const covered = coverage.filter(c => c.covered.length > 0)

  if (signups.length === 0) {
    return (
      <p className="mn-slot-hint">
        Raid buffs will show up here once people start signing up.
      </p>
    )
  }

  return (
    <div className="mn-buffs">
      <div className="mn-buffs-head">
        <h4 className="mn-signup-title">Raid buffs</h4>
        <span className="mn-buffs-score">
          {covered.length}/{coverage.length} covered
        </span>
      </div>

      {missing.length > 0 && (
        <div className="mn-buff-group">
          <span className="mn-buff-group-label mn-buff-label-missing">Missing</span>
          <ul className="mn-buff-list">
            {missing.map(({ buff }) => (
              <li key={buff.name} className="mn-buff mn-buff-missing">
                <span className="mn-buff-name">{buff.name}</span>
                <span className="mn-buff-from">
                  needs{' '}
                  {buff.classes.map((c, i) => (
                    <span key={c}>
                      {i > 0 && ' / '}
                      <span style={{ color: classColor(c) }}>{c}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {covered.length > 0 && (
        <div className="mn-buff-group">
          <span className="mn-buff-group-label mn-buff-label-covered">Covered</span>
          <ul className="mn-buff-list">
            {covered.map(({ buff, covered: by }) => (
              <li key={buff.name} className="mn-buff mn-buff-covered">
                <span className="mn-buff-name">{buff.name}</span>
                <span className="mn-buff-from">
                  {by.map((c, i) => (
                    <span key={c}>
                      {i > 0 && ' · '}
                      <span style={{ color: classColor(c) }}>{c}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mn-buffs-note">
        Death Knight, Rogue and Warlock bring utility rather than a raid-wide
        buff, so they are never listed as a gap.
      </p>
    </div>
  )
}
