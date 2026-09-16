import { useState } from 'react'
import { loadState, saveState } from '../storage.js'
import { parseICS, icsDateToISO } from '../ics.js'

const HOMEWORK_KEY = 'henry.homework'
const SATCHEL_URL_KEY = 'henry.homework.satchelUrl'
const SATCHEL_ITEMS_KEY = 'henry.homework.satchelItems'
const SATCHEL_SYNCED_KEY = 'henry.homework.satchelSyncedAt'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Homework() {
  const [items, setItems] = useState(() => loadState(HOMEWORK_KEY, []))
  const [subject, setSubject] = useState('')
  const [dueDate, setDueDate] = useState(todayISO())

  const [satchelUrl, setSatchelUrl] = useState(() => loadState(SATCHEL_URL_KEY, ''))
  const [satchelItems, setSatchelItems] = useState(() => loadState(SATCHEL_ITEMS_KEY, []))
  const [syncedAt, setSyncedAt] = useState(() => loadState(SATCHEL_SYNCED_KEY, ''))
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const sortedSatchel = [...satchelItems].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const today = todayISO()

  function addItem(e) {
    e.preventDefault()
    if (!subject.trim()) return
    const next = [...items, { id: crypto.randomUUID(), subject: subject.trim(), dueDate, done: false }]
    setItems(next)
    saveState(HOMEWORK_KEY, next)
    setSubject('')
  }

  function toggleDone(id) {
    const next = items.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    setItems(next)
    saveState(HOMEWORK_KEY, next)
  }

  function removeItem(id) {
    const next = items.filter((item) => item.id !== id)
    setItems(next)
    saveState(HOMEWORK_KEY, next)
  }

  function updateSatchelUrl(value) {
    setSatchelUrl(value)
    saveState(SATCHEL_URL_KEY, value)
  }

  async function fetchICSText(url) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch {
      const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      const res = await fetch(proxied)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    }
  }

  async function syncSatchel() {
    if (!satchelUrl.trim()) return
    setSyncing(true)
    setSyncError('')
    try {
      const text = await fetchICSText(satchelUrl.trim())
      const events = parseICS(text)
      const next = events
        .map((ev) => ({
          id: ev.uid || crypto.randomUUID(),
          subject: ev.summary || 'Homework',
          dueDate: icsDateToISO(ev.dtstart),
        }))
        .filter((item) => item.dueDate)
      setSatchelItems(next)
      saveState(SATCHEL_ITEMS_KEY, next)
      const now = new Date().toISOString()
      setSyncedAt(now)
      saveState(SATCHEL_SYNCED_KEY, now)
    } catch {
      setSyncError(
        "Couldn't load the feed, even via a fallback proxy — Satchel One's server may be down, or the link may have expired. Try re-copying the link from Satchel One, or use \"Open Satchel One\" below.",
      )
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="page">
      <h1>Homework</h1>

      <section className="card">
        <h2>Satchel One sync</h2>
        <p className="empty-note">
          Paste your personal calendar feed link (Satchel One → Settings → Calendar sync → long-press
          "Sync my calendar" → Copy Link). Stays only on this device — but since Satchel One blocks
          direct requests, syncing sends the link through a free public relay (allorigins.win) to fetch it.
        </p>
        <div className="inline-form">
          <input
            type="url"
            placeholder="https://api.satchelone.com/icalendars.ics?token=..."
            value={satchelUrl}
            onChange={(e) => updateSatchelUrl(e.target.value)}
          />
          <button type="button" onClick={syncSatchel} disabled={syncing || !satchelUrl.trim()}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        {syncError && <p className="homework-overdue">{syncError}</p>}
        {syncedAt && !syncError && (
          <p className="empty-note">Last synced {new Date(syncedAt).toLocaleString()}</p>
        )}

        {sortedSatchel.length > 0 && (
          <ul className="list">
            {sortedSatchel.map((item) => {
              const overdue = item.dueDate < today
              return (
                <li key={item.id} className="list-row">
                  <span className={overdue ? 'homework-overdue' : ''}>
                    {item.subject}
                    <span className="fixture-meta"> · due {item.dueDate}{overdue ? ' (overdue)' : ''}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <a
          className="quick-link"
          href="https://www.satchelone.com/login"
          target="_blank"
          rel="noreferrer"
        >
          📘 Open Satchel One
        </a>
      </section>

      <section className="card">
        <h2>Add homework</h2>
        <form className="inline-form" onSubmit={addItem}>
          <input
            placeholder="Subject / task"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          <button type="submit">Add</button>
        </form>
      </section>

      <section className="card">
        <h2>To do</h2>
        {sorted.length === 0 && <p className="empty-note">No homework tracked yet.</p>}
        <ul className="list">
          {sorted.map((item) => {
            const overdue = !item.done && item.dueDate < today
            return (
              <li key={item.id} className="list-row">
                <label className="checkbox-row">
                  <input type="checkbox" checked={item.done} onChange={() => toggleDone(item.id)} />
                  <span className={item.done ? 'trick-done' : overdue ? 'homework-overdue' : ''}>
                    {item.subject}
                    <span className="fixture-meta"> · due {item.dueDate}{overdue ? ' (overdue)' : ''}</span>
                  </span>
                </label>
                <button className="link-button" onClick={() => removeItem(item.id)} type="button">
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
