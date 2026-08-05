import { NavLink } from 'react-router-dom'

// The leaderboard lives in a separate Vercel project, so it is a plain anchor.
// Set VITE_CLB_URL in the Vercel project settings once the domain is final.
const CLB_URL = import.meta.env.VITE_CLB_URL ?? 'https://tank-me-later.vercel.app'

const cls = ({ isActive }: { isActive: boolean }) => 'nav-link' + (isActive ? ' nav-link-active' : '')

export function Nav() {
  return (
    <nav className="site-nav">
      <a className="nav-link" href={CLB_URL}>CLB</a>
      <NavLink to="/" end className={cls}>Title Watch</NavLink>
      <NavLink to="/command-room" className={cls}>Command Room</NavLink>
    </nav>
  )
}
