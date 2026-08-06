import { NavLink } from 'react-router-dom'

const cls = ({ isActive }: { isActive: boolean }) => 'nav-link' + (isActive ? ' nav-link-active' : '')

// This app is Title Watch and the Command Room only — no link back to the
// CLB leaderboard, which lives in the tank-me-later project.
export function Nav() {
  return (
    <nav className="site-nav">
      <NavLink to="/" end className={cls}>Title Watch</NavLink>
      <NavLink to="/command-room" className={cls}>Command Room</NavLink>
    </nav>
  )
}
