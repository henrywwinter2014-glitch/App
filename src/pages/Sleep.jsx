import { useState } from 'react'
import { loadState, saveState } from '../storage.js'

const SLEEP_KEY = 'henry.sleep.log'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Sleep() {
  const [log, setLog] = useState(() => loadState(SLEEP_KEY, []))
  const [date, setDate] = useState(todayISO())
  const [hours, setHours] = useState('')

  const sorted = [...log].sort((a, b) => b.date.localeCompare(a.date))
  const average = log.length
    ? (log.reduce((sum, e) => sum + Number(e.hours), 0) / log.length).toFixed(1)
    : null

  function addEntry(e) {
    e.preventDefault()
    if (!hours) return
    const withoutDate = log.filter((entry) => entry.date !== date)
    const next = [...withoutDate, { date, hours: Number(hours) }]
    setLog(next)
    saveState(SLEEP_KEY, next)
    setHours('')
  }

  function removeEntry(entryDate) {
    const next = log.filter((entry) => entry.date !== entryDate)
    setLog(next)
    saveState(SLEEP_KEY, next)
  }

  return (
    <div className="page">
      <h1>Sleep tracker</h1>

      <section className="card">
        <div className="stat-row">
          <div className="stat-box">
            <span className="stat-value">{average ?? '–'}</span>
            <span className="stat-label">avg hours</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{log.length}</span>
            <span className="stat-label">nights logged</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Log a night</h2>
        <form className="inline-form" onSubmit={addEntry}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <input
            type="number"
            min="0"
            max="24"
            step="0.5"
            placeholder="Hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
          />
          <button type="submit">Save</button>
        </form>
      </section>

      <section className="card">
        <h2>History</h2>
        {sorted.length === 0 && <p className="empty-note">No nights logged yet.</p>}
        <ul className="list">
          {sorted.map((entry) => (
            <li key={entry.date} className="list-row">
              <span>{entry.date}</span>
              <span>{entry.hours}h</span>
              <button className="link-button" onClick={() => removeEntry(entry.date)} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
