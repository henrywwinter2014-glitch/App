import { useState } from 'react'
import { loadState, saveState } from '../storage.js'

const CLASSES_KEY = 'henry.strength.classes'

const STARTER_CLASSES = [
  { day: 'Monday', name: 'Strength & conditioning', time: '4:30pm', done: false },
  { day: 'Wednesday', name: 'Gym - core & legs', time: '4:30pm', done: false },
  { day: 'Saturday', name: 'Football fitness', time: '9:00am', done: false },
]

export default function Strength() {
  const [classes, setClasses] = useState(() => loadState(CLASSES_KEY, STARTER_CLASSES))
  const [name, setName] = useState('')
  const [day, setDay] = useState('Monday')
  const [time, setTime] = useState('')

  const doneCount = classes.filter((c) => c.done).length

  function toggleDone(index) {
    const next = classes.map((c, i) => (i === index ? { ...c, done: !c.done } : c))
    setClasses(next)
    saveState(CLASSES_KEY, next)
  }

  function addClass(e) {
    e.preventDefault()
    if (!name.trim()) return
    const next = [...classes, { day, name: name.trim(), time, done: false }]
    setClasses(next)
    saveState(CLASSES_KEY, next)
    setName('')
    setTime('')
  }

  function removeClass(index) {
    const next = classes.filter((_, i) => i !== index)
    setClasses(next)
    saveState(CLASSES_KEY, next)
  }

  return (
    <div className="page">
      <h1>Strength &amp; gym classes</h1>

      <section className="card">
        <div className="stat-row">
          <div className="stat-box">
            <span className="stat-value">{doneCount}/{classes.length}</span>
            <span className="stat-label">done this week</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>This week's classes</h2>
        <ul className="list">
          {classes.map((c, i) => (
            <li key={c.day + c.name + i} className="list-row">
              <label className="checkbox-row">
                <input type="checkbox" checked={c.done} onChange={() => toggleDone(i)} />
                <span className={c.done ? 'trick-done' : ''}>
                  {c.name}
                  <span className="fixture-meta"> · {c.day}{c.time ? ` · ${c.time}` : ''}</span>
                </span>
              </label>
              <button className="link-button" onClick={() => removeClass(i)} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={addClass}>
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input placeholder="Class name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Time" value={time} onChange={(e) => setTime(e.target.value)} />
          <button type="submit">Add</button>
        </form>
      </section>
    </div>
  )
}
