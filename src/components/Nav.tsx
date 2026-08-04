import { NavLink } from 'react-router-dom'

export function Nav() {
  return (
    <nav className="site-nav">
      <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
        CLB
      </NavLink>
      <NavLink to="/watch" className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
        Title Watch
      </NavLink>
    </nav>
  )
}
