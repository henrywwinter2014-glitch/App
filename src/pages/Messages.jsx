import { useState } from 'react'
import { loadState, saveState } from '../storage.js'

const THREADS_KEY = 'henry.messages.threads'

export default function Messages() {
  const [threads, setThreads] = useState(() => loadState(THREADS_KEY, []))
  const [newFriend, setNewFriend] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState('')

  const active = threads.find((t) => t.id === activeId) || null

  function addFriend(e) {
    e.preventDefault()
    if (!newFriend.trim()) return
    const thread = { id: crypto.randomUUID(), friend: newFriend.trim(), messages: [] }
    const next = [...threads, thread]
    setThreads(next)
    saveState(THREADS_KEY, next)
    setNewFriend('')
    setActiveId(thread.id)
  }

  function removeFriend(id) {
    const next = threads.filter((t) => t.id !== id)
    setThreads(next)
    saveState(THREADS_KEY, next)
    if (activeId === id) setActiveId(null)
  }

  function sendMessage(e) {
    e.preventDefault()
    if (!draft.trim() || !active) return
    const next = threads.map((t) =>
      t.id === active.id
        ? { ...t, messages: [...t.messages, { text: draft.trim(), at: new Date().toISOString() }] }
        : t,
    )
    setThreads(next)
    saveState(THREADS_KEY, next)
    setDraft('')
  }

  if (active) {
    return (
      <div className="page">
        <button className="link-button back-link" onClick={() => setActiveId(null)} type="button">
          ← Back
        </button>
        <h1>{active.friend}</h1>
        <p className="empty-note">Local notes only — not sent anywhere until a real messaging backend is added.</p>

        <section className="card">
          <ul className="list">
            {active.messages.map((m, i) => (
              <li key={i} className="list-row">
                <span>{m.text}</span>
                <span className="fixture-meta">{new Date(m.at).toLocaleString()}</span>
              </li>
            ))}
            {active.messages.length === 0 && <p className="empty-note">No notes yet.</p>}
          </ul>
          <form className="inline-form" onSubmit={sendMessage}>
            <input placeholder="Write a note" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button type="submit">Save</button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Messages</h1>
      <p className="empty-note">Local friend notes for now — real messaging needs a backend.</p>

      <section className="card">
        <h2>Friends</h2>
        <ul className="list">
          {threads.map((t) => (
            <li key={t.id} className="list-row">
              <button className="quick-link thread-link" onClick={() => setActiveId(t.id)} type="button">
                {t.friend}
              </button>
              <button className="link-button" onClick={() => removeFriend(t.id)} type="button">
                Remove
              </button>
            </li>
          ))}
          {threads.length === 0 && <p className="empty-note">Add a friend to start a note thread.</p>}
        </ul>
        <form className="inline-form" onSubmit={addFriend}>
          <input placeholder="Friend's name" value={newFriend} onChange={(e) => setNewFriend(e.target.value)} />
          <button type="submit">Add</button>
        </form>
      </section>
    </div>
  )
}
