import { useState } from 'react'
import { loadState, saveState } from '../storage.js'

const HOMEWORK_KEY = 'henry.homework'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Homework() {
  const [items, setItems] = useState(() => loadState(HOMEWORK_KEY, []))
  const [subject, setSubject] = useState('')
  const [dueDate, setDueDate] = useState(todayISO())

  const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
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

  return (
    <div className="page">
      <h1>Homework</h1>

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
