import { useState } from 'react'
import { loadState, saveState } from '../storage.js'

const TRICKS_KEY = 'henry.tricks'
const DREAM_KEY = 'henry.tricks.dream'
const PARK_KEY = 'henry.tricks.park'
const VIDEOS_KEY = 'henry.tricks.videos'

const STARTER_TRICKS = [
  { name: 'Bunny hop', done: false },
  { name: 'Manual', done: false },
  { name: '180', done: false },
  { name: 'Tailwhip', done: false },
  { name: 'Bar spin', done: false },
]

export default function Tricks() {
  const [tricks, setTricks] = useState(() => loadState(TRICKS_KEY, STARTER_TRICKS))
  const [dreamTricks, setDreamTricks] = useState(() => loadState(DREAM_KEY, []))
  const [newTrick, setNewTrick] = useState('')
  const [newDream, setNewDream] = useState('')
  const [park, setPark] = useState(() => loadState(PARK_KEY, ''))
  const [videos, setVideos] = useState(() => loadState(VIDEOS_KEY, []))
  const [newVideo, setNewVideo] = useState('')

  const doneCount = tricks.filter((t) => t.done).length

  function toggleTrick(index) {
    const next = tricks.map((t, i) => (i === index ? { ...t, done: !t.done } : t))
    setTricks(next)
    saveState(TRICKS_KEY, next)
  }

  function addTrick(e) {
    e.preventDefault()
    if (!newTrick.trim()) return
    const next = [...tricks, { name: newTrick.trim(), done: false }]
    setTricks(next)
    saveState(TRICKS_KEY, next)
    setNewTrick('')
  }

  function removeTrick(index) {
    const next = tricks.filter((_, i) => i !== index)
    setTricks(next)
    saveState(TRICKS_KEY, next)
  }

  function addDream(e) {
    e.preventDefault()
    if (!newDream.trim()) return
    const next = [...dreamTricks, newDream.trim()]
    setDreamTricks(next)
    saveState(DREAM_KEY, next)
    setNewDream('')
  }

  function removeDream(index) {
    const next = dreamTricks.filter((_, i) => i !== index)
    setDreamTricks(next)
    saveState(DREAM_KEY, next)
  }

  function updatePark(value) {
    setPark(value)
    saveState(PARK_KEY, value)
  }

  function addVideo(e) {
    e.preventDefault()
    if (!newVideo.trim()) return
    const next = [...videos, newVideo.trim()]
    setVideos(next)
    saveState(VIDEOS_KEY, next)
    setNewVideo('')
  }

  function removeVideo(index) {
    const next = videos.filter((_, i) => i !== index)
    setVideos(next)
    saveState(VIDEOS_KEY, next)
  }

  return (
    <div className="page">
      <h1>Scooter trick list</h1>

      <section className="card">
        <h2>Tricks landed ({doneCount}/{tricks.length})</h2>
        <ul className="list">
          {tricks.map((trick, i) => (
            <li key={trick.name + i} className="list-row">
              <label className="checkbox-row">
                <input type="checkbox" checked={trick.done} onChange={() => toggleTrick(i)} />
                <span className={trick.done ? 'trick-done' : ''}>{trick.name}</span>
              </label>
              <button className="link-button" onClick={() => removeTrick(i)} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={addTrick}>
          <input
            placeholder="Add a trick"
            value={newTrick}
            onChange={(e) => setNewTrick(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </section>

      <section className="card">
        <h2>Dream tricks</h2>
        <ul className="list">
          {dreamTricks.map((trick, i) => (
            <li key={trick + i} className="list-row">
              <span>✨ {trick}</span>
              <button className="link-button" onClick={() => removeDream(i)} type="button">
                Remove
              </button>
            </li>
          ))}
          {dreamTricks.length === 0 && <p className="empty-note">Add tricks you want to learn next.</p>}
        </ul>
        <form className="inline-form" onSubmit={addDream}>
          <input
            placeholder="Add a dream trick"
            value={newDream}
            onChange={(e) => setNewDream(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </section>

      <section className="card">
        <h2>Video recommendations</h2>
        <ul className="list">
          {videos.map((video, i) => (
            <li key={video + i} className="list-row">
              {/^https?:\/\//.test(video) ? (
                <a href={video} target="_blank" rel="noreferrer">{video}</a>
              ) : (
                <span>🎬 {video}</span>
              )}
              <button className="link-button" onClick={() => removeVideo(i)} type="button">
                Remove
              </button>
            </li>
          ))}
          {videos.length === 0 && <p className="empty-note">Save trick tutorial links or titles here.</p>}
        </ul>
        <form className="inline-form" onSubmit={addVideo}>
          <input
            placeholder="Paste a video link or title"
            value={newVideo}
            onChange={(e) => setNewVideo(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </section>

      <section className="card">
        <h2>Local scooter park</h2>
        <textarea
          className="park-notes"
          placeholder="Name, address, notes about your local scooter park..."
          value={park}
          onChange={(e) => updatePark(e.target.value)}
          rows={3}
        />
      </section>
    </div>
  )
}
