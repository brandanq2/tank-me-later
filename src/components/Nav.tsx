import { NavLink } from 'react-router-dom'
import { useFlag } from '../hooks/useFlags'

export function Nav() {
  const openLeaderboard = useFlag('open-leaderboard')

  return (
    <nav className="site-nav">
      <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
        Tank Me Later
      </NavLink>
      <NavLink to="/augs" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
        For All the Augs
      </NavLink>
      {openLeaderboard && (
        <NavLink to="/open" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
          Open Leaderboard
        </NavLink>
      )}
    </nav>
  )
}
