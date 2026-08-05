import { NavLink } from 'react-router-dom'
import { TITLE_WATCH_URL } from '../titleWatchUrl'

const cls = ({ isActive }: { isActive: boolean }) => 'nav-link' + (isActive ? ' nav-link-active' : '')

export function Nav() {
  return (
    <nav className="site-nav">
      <NavLink to="/" end className={cls}>CLB</NavLink>
      {/* Title Watch and Command Room are a separate Vercel project. */}
      <a className="nav-link" href={TITLE_WATCH_URL}>Title Watch</a>
      <a className="nav-link" href={`${TITLE_WATCH_URL}/command-room`}>Command Room</a>
    </nav>
  )
}
