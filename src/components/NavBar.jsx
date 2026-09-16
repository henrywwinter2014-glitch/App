import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/sleep', label: 'Sleep', icon: '😴' },
  { to: '/football', label: 'Football', icon: '⚽' },
  { to: '/tricks', label: 'Tricks', icon: '🛴' },
  { to: '/more', label: 'More', icon: '➕' },
]

export default function NavBar() {
  return (
    <nav className="nav-bar">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => 'nav-tab' + (isActive ? ' nav-tab-active' : '')}
        >
          <span className="nav-icon" aria-hidden="true">{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
