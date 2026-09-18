import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadState, saveState } from '../storage.js'
import { putFile, getFile, deleteFile } from '../idb.js'
import { DAYS, mergedDay, COLOUR_LABELS } from '../timetableData.js'

const SLEEP_KEY = 'henry.sleep.log'
const TIMETABLE_FILE_ID = 'timetableFile'
const TIMETABLE_FILE_META_KEY = 'henry.timetableFile.meta'
const WEEK_KEY = 'henry.timetable.week'

function todayName() {
  const idx = new Date().getDay() // 0 Sun ... 6 Sat
  const map = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' }
  return map[idx] || 'Monday'
}

export default function Home() {
  const [activeDay, setActiveDay] = useState(todayName())
  const [week, setWeek] = useState(() => loadState(WEEK_KEY, 'A'))

  const sleepLog = loadState(SLEEP_KEY, [])
  const lastNightHours = useMemo(() => {
    if (sleepLog.length === 0) return null
    return [...sleepLog].sort((a, b) => b.date.localeCompare(a.date))[0].hours
  }, [sleepLog])

  const [fileMeta, setFileMeta] = useState(() => loadState(TIMETABLE_FILE_META_KEY, null))
  const [fileUrl, setFileUrl] = useState(null)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false
    if (fileMeta) {
      getFile(TIMETABLE_FILE_ID).then((blob) => {
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob)
          setFileUrl(objectUrl)
        }
      })
    } else {
      setFileUrl(null)
    }
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileMeta])

  function changeWeek(next) {
    setWeek(next)
    saveState(WEEK_KEY, next)
  }

  const daySlots = useMemo(() => mergedDay(week, activeDay), [week, activeDay])

  async function handleTimetableFile(e) {
    const file = e.target.files[0]
    if (!file) return
    await putFile(TIMETABLE_FILE_ID, file)
    const meta = { name: file.name, type: file.type }
    setFileMeta(meta)
    saveState(TIMETABLE_FILE_META_KEY, meta)
  }

  async function removeTimetableFile() {
    await deleteFile(TIMETABLE_FILE_ID)
    setFileMeta(null)
    saveState(TIMETABLE_FILE_META_KEY, null)
  }

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
      </header>

      <section className="card">
        <h2>My timetable file</h2>
        <p className="empty-note">
          Upload a photo or PDF of your real school timetable to check anytime.
        </p>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={handleTimetableFile}
        />
        {fileMeta && fileUrl && (
          <>
            {fileMeta.type === 'application/pdf' ? (
              <a className="quick-link" href={fileUrl} target="_blank" rel="noreferrer">
                📄 View {fileMeta.name}
              </a>
            ) : (
              <img className="timetable-photo" src={fileUrl} alt="My timetable" />
            )}
            <button className="link-button" onClick={removeTimetableFile} type="button">
              Remove file
            </button>
          </>
        )}
      </section>

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
