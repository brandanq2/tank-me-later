import { NavLink } from 'react-router-dom'
import { TITLE_WATCH_URL } from '../titleWatchUrl'
import { useMidnightAccess } from '../midnight/access'

const cls = ({ isActive }: { isActive: boolean }) => 'nav-link' + (isActive ? ' nav-link-active' : '')

export function Nav() {
  // Strike Team is invite-only, so the link stays hidden until this browser has
  // entered a valid code. The route itself is always reachable by URL — the
  // gate, not the nav, is what keeps people out.
  const midnight = useMidnightAccess()

  return (
    <nav className="site-nav">
      <NavLink to="/" end className={cls}>CLB</NavLink>
      {/* Title Watch and Command Room are a separate Vercel project. */}
      <a className="nav-link" href={TITLE_WATCH_URL}>Title Watch</a>
      <a className="nav-link" href={`${TITLE_WATCH_URL}/command-room`}>Command Room</a>
      {midnight.code && <NavLink to="/strike-team" className={cls}>Strike Team</NavLink>}
    </nav>
  )
}
