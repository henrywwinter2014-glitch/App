import { Link } from 'react-router-dom'

const LINKS = [
  { to: '/homework', label: '📚 Homework' },
  { to: '/strength', label: '💪 Strength & gym' },
  { to: '/outfits', label: '👕 Outfits, weather & sizes' },
  { to: '/messages', label: '💬 Messages' },
]

export default function More() {
  return (
    <div className="page">
      <h1>More</h1>
      <section className="card">
        <div className="more-grid">
          {LINKS.map((link) => (
            <Link key={link.to} className="quick-link" to={link.to}>
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
