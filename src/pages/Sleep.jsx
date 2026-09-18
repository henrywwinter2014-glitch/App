import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadState, saveState } from '../storage.js'

const SLEEP_KEY = 'henry.sleep.log'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Sleep() {
  const [log, setLog] = useState(() => loadState(SLEEP_KEY, []))
  const [date, setDate] = useState(todayISO())
  const [hours, setHours] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [autoLogged, setAutoLogged] = useState(null)

  useEffect(() => {
    const autoHours = searchParams.get('hours')
    if (!autoHours) return
    const autoDate = searchParams.get('date') || todayISO()
    const current = loadState(SLEEP_KEY, [])
    const withoutDate = current.filter((entry) => entry.date !== autoDate)
    const next = [...withoutDate, { date: autoDate, hours: Number(autoHours) }]
    saveState(SLEEP_KEY, next)
    setLog(next)
    setAutoLogged({ date: autoDate, hours: Number(autoHours) })
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

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

      {autoLogged && (
        <p className="empty-note">
          ✅ Logged {autoLogged.hours}h for {autoLogged.date} from your Apple Watch shortcut.
        </p>
      )}

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
        <h2>Auto-log from Apple Watch</h2>
        <p className="empty-note">
          No app (including this one) can read your Watch's Health data directly — that's an Apple
          rule, not a limit of this app. But the Shortcuts app can, and can hand it to this page. Set
          up a Shortcut that opens this link with your sleep hours filled in:
        </p>
        <p className="empty-note" style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
          {window.location.origin}{window.location.pathname}#/sleep?hours=8
        </p>
        <p className="empty-note">
          In Shortcuts: add <strong>Get Health Sample</strong> → type <strong>Sleep Analysis</strong>,
          aggregate <strong>Sum</strong>, last <strong>1 Day</strong> → then <strong>Open URLs</strong>{' '}
          with the link above, replacing <code>8</code> with that value. Add it as a Personal
          Automation (Automation tab → time of day, e.g. 7:30am) to run each morning.
        </p>
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
