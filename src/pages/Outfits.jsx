import { useState } from 'react'
import { loadState, saveState } from '../storage.js'

const OUTFITS_KEY = 'henry.outfits.saved'
const SIZES_KEY = 'henry.sizes'

const FORECAST = [
  { day: 'Mon', condition: '☀️', temp: 18 },
  { day: 'Tue', condition: '⛅', temp: 15 },
  { day: 'Wed', condition: '🌧️', temp: 12 },
  { day: 'Thu', condition: '🌧️', temp: 11 },
  { day: 'Fri', condition: '☀️', temp: 17 },
]

function suggestion(day) {
  if (day.condition === '🌧️') return 'Coat + waterproof shoes'
  if (day.temp <= 12) return 'Jumper + coat'
  if (day.temp <= 16) return 'Hoodie'
  return 'T-shirt'
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Outfits() {
  const [outfits, setOutfits] = useState(() => loadState(OUTFITS_KEY, []))
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [shoes, setShoes] = useState('')
  const [outfitName, setOutfitName] = useState('')

  const [sizes, setSizes] = useState(() => loadState(SIZES_KEY, []))
  const [sizeCategory, setSizeCategory] = useState('Shoes')
  const [sizeValue, setSizeValue] = useState('')
  const [sizeDate, setSizeDate] = useState(todayISO())

  function addOutfit(e) {
    e.preventDefault()
    if (!top.trim() && !bottom.trim() && !shoes.trim()) return
    const next = [
      ...outfits,
      { id: crypto.randomUUID(), name: outfitName.trim() || 'Outfit', top, bottom, shoes },
    ]
    setOutfits(next)
    saveState(OUTFITS_KEY, next)
    setOutfitName('')
    setTop('')
    setBottom('')
    setShoes('')
  }

  function removeOutfit(id) {
    const next = outfits.filter((o) => o.id !== id)
    setOutfits(next)
    saveState(OUTFITS_KEY, next)
  }

  function addSize(e) {
    e.preventDefault()
    if (!sizeValue.trim()) return
    const next = [...sizes, { id: crypto.randomUUID(), date: sizeDate, category: sizeCategory, value: sizeValue.trim() }]
    setSizes(next)
    saveState(SIZES_KEY, next)
    setSizeValue('')
  }

  function removeSize(id) {
    const next = sizes.filter((s) => s.id !== id)
    setSizes(next)
    saveState(SIZES_KEY, next)
  }

  const sortedSizes = [...sizes].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="page">
      <h1>Outfits</h1>

      <section className="card">
        <h2>Weather planner</h2>
        <p className="empty-note">Sample forecast — swap in a live weather API when you're ready.</p>
        <ul className="list">
          {FORECAST.map((day) => (
            <li key={day.day} className="list-row fixture-row">
              <div>
                <strong>{day.day}</strong> {day.condition} {day.temp}°C
                <div className="fixture-meta">Wear: {suggestion(day)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Outfit maker</h2>
        <form className="inline-form" onSubmit={addOutfit}>
          <input placeholder="Outfit name" value={outfitName} onChange={(e) => setOutfitName(e.target.value)} />
          <input placeholder="Top" value={top} onChange={(e) => setTop(e.target.value)} />
          <input placeholder="Bottom" value={bottom} onChange={(e) => setBottom(e.target.value)} />
          <input placeholder="Shoes" value={shoes} onChange={(e) => setShoes(e.target.value)} />
          <button type="submit">Save outfit</button>
        </form>
        <ul className="list">
          {outfits.map((o) => (
            <li key={o.id} className="list-row fixture-row">
              <div>
                <strong>{o.name}</strong>
                <div className="fixture-meta">
                  {[o.top, o.bottom, o.shoes].filter(Boolean).join(' · ') || 'No items yet'}
                </div>
              </div>
              <button className="link-button" onClick={() => removeOutfit(o.id)} type="button">
                Remove
              </button>
            </li>
          ))}
          {outfits.length === 0 && <p className="empty-note">Save your first outfit above.</p>}
        </ul>
      </section>

      <section className="card">
        <h2>Size tracker</h2>
        <form className="inline-form" onSubmit={addSize}>
          <select value={sizeCategory} onChange={(e) => setSizeCategory(e.target.value)}>
            {['Shoes', 'Tops', 'Trousers', 'Height'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input placeholder="Size / value" value={sizeValue} onChange={(e) => setSizeValue(e.target.value)} />
          <input type="date" value={sizeDate} onChange={(e) => setSizeDate(e.target.value)} />
          <button type="submit">Log</button>
        </form>
        <ul className="list">
          {sortedSizes.map((s) => (
            <li key={s.id} className="list-row">
              <span>{s.category}: {s.value}</span>
              <span className="fixture-meta">{s.date}</span>
              <button className="link-button" onClick={() => removeSize(s.id)} type="button">
                Remove
              </button>
            </li>
          ))}
          {sortedSizes.length === 0 && <p className="empty-note">No sizes logged yet.</p>}
        </ul>
      </section>
    </div>
  )
}
