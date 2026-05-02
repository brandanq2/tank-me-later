import { NavLink } from 'react-router-dom'

export function Nav() {
  return (
    <nav className="site-nav">
      <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
        Tank Me Later
      </NavLink>
      <NavLink to="/augs" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
        For All the Augs
      </NavLink>
    </nav>
  )
}
