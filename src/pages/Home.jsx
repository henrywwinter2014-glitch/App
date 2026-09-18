import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadState, saveState } from '../storage.js'
import { DAYS, ROW_TIMES, WEEKS, COLOUR_LABELS } from '../timetableData.js'

const SLEEP_KEY = 'henry.sleep.log'
const WEEK_KEY = 'henry.timetable.week'
const FILLER_SUBJECTS = ['Registration', 'Break', 'Lunch', 'Assembly']

function todayName() {
  const idx = new Date().getDay() // 0 Sun ... 6 Sat
  const map = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' }
  return map[idx] || 'Monday'
}

function humanList(items) {
  if (items.length === 0) return 'nothing on'
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export default function Home() {
  const [activeDay, setActiveDay] = useState(todayName())
  const [week, setWeek] = useState(() => loadState(WEEK_KEY, 'A'))

  const sleepLog = loadState(SLEEP_KEY, [])
  const lastNightHours = useMemo(() => {
    if (sleepLog.length === 0) return null
    return [...sleepLog].sort((a, b) => b.date.localeCompare(a.date))[0].hours
  }, [sleepLog])

  function changeWeek(next) {
    setWeek(next)
    saveState(WEEK_KEY, next)
  }

  const daySlots = useMemo(
    () => WEEKS[week][activeDay].map((slot, i) => ({ ...slot, start: ROW_TIMES[i][0], end: ROW_TIMES[i][1] })),
    [week, activeDay],
  )

  const todaySubjects = useMemo(() => {
    const list = WEEKS[week][todayName()].map((s) => s.subject).filter((s) => !FILLER_SUBJECTS.includes(s))
    return [...new Set(list)]
  }, [week])

  return (
    <div className="page">
      <header className="welcome-header">
        <h1>Welcome Henry</h1>
        <div className="welcome-stats">
          <Link to="/sleep" className="stat-pill">
            <span className="stat-icon">😴</span>
            <span>{lastNightHours != null ? `${lastNightHours}h sleep` : 'Log sleep'}</span>
          </Link>
          <span className="stat-pill stat-pill-static">
            <span className="stat-icon">💬</span>
            <span>Messages</span>
          </span>
        </div>
        <p className="today-summary">Today you have {humanList(todaySubjects)}.</p>
      </header>

      <section className="card">
        <h2>Timetable</h2>
        <div className="day-picker">
          {['A', 'B'].map((w) => (
            <button
              key={w}
              className={'day-chip' + (w === week ? ' day-chip-active' : '')}
              onClick={() => changeWeek(w)}
              type="button"
            >
              Week {w}
            </button>
          ))}
        </div>
        <div className="day-picker">
          {DAYS.map((day) => (
            <button
              key={day}
              className={'day-chip' + (day === activeDay ? ' day-chip-active' : '')}
              onClick={() => setActiveDay(day)}
              type="button"
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="timetable-grid">
          {daySlots.map((slot, i) => (
            <div className={`timetable-slot tt-${slot.colour}`} key={i}>
              <span className="timetable-slot-time">{slot.start}–{slot.end}</span>
              <span className="timetable-slot-subject">{slot.subject}</span>
              {slot.teacher && (
                <span className="timetable-slot-meta">{slot.teacher} · {slot.room}</span>
              )}
            </div>
          ))}
        </div>
        <div className="tt-legend">
          {Object.entries(COLOUR_LABELS).map(([key, label]) => (
            <span className={`tt-legend-item tt-${key}`} key={key}>{label}</span>
          ))}
        </div>
      </section>

      <section className="card quick-links">
        <h2>Quick links</h2>
        <div className="quick-grid">
          <Link className="quick-link" to="/sleep">😴 Sleep tracker</Link>
          <Link className="quick-link" to="/football">⚽ Arsenal &amp; football</Link>
          <Link className="quick-link" to="/tricks">🛴 Trick list</Link>
          <Link className="quick-link" to="/homework">📚 Homework</Link>
          <Link className="quick-link" to="/more">➕ More</Link>
        </div>
      </section>
    </div>
  )
}
