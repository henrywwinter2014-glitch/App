import { useState } from 'react'
import { loadState, saveState } from '../storage.js'

const FRIENDS_KEY = 'henry.messages.friends'

function isIOS() {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function smsHref(phone, body) {
  const cleanPhone = phone.replace(/[^\d+]/g, '')
  if (!body) return `sms:${cleanPhone}`
  const separator = isIOS() ? '&' : '?'
  return `sms:${cleanPhone}${separator}body=${encodeURIComponent(body)}`
}

export default function Messages() {
  const [friends, setFriends] = useState(() => loadState(FRIENDS_KEY, []))
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState('')

  const active = friends.find((f) => f.id === activeId) || null

  function addFriend(e) {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return
    const next = [...friends, { id: crypto.randomUUID(), name: name.trim(), phone: phone.trim() }]
    setFriends(next)
    saveState(FRIENDS_KEY, next)
    setName('')
    setPhone('')
  }

  function removeFriend(id) {
    const next = friends.filter((f) => f.id !== id)
    setFriends(next)
    saveState(FRIENDS_KEY, next)
    if (activeId === id) setActiveId(null)
  }

  if (active) {
    return (
      <div className="page">
        <button className="link-button back-link" onClick={() => setActiveId(null)} type="button">
          ← Back
        </button>
        <h1>{active.name}</h1>
        <p className="empty-note">Opens the Messages app on your iPhone to actually send it.</p>

        <section className="card">
          <a className="quick-link" href={smsHref(active.phone, '')}>
            💬 Open chat with {active.name}
          </a>
        </section>

        <section className="card">
          <h2>Quick message</h2>
          <textarea
            className="park-notes"
            placeholder="Type a message..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
          />
          <a
            className="quick-link send-link"
            href={smsHref(active.phone, draft)}
            onClick={() => setDraft('')}
          >
            Send via Messages
          </a>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Messages</h1>
      <p className="empty-note">Links out to your iPhone's Messages app to send real texts.</p>

      <section className="card">
        <h2>Friends</h2>
        <ul className="list">
          {friends.map((f) => (
            <li key={f.id} className="list-row">
              <button className="quick-link thread-link" onClick={() => setActiveId(f.id)} type="button">
                {f.name}
              </button>
              <a className="link-button" href={smsHref(f.phone, '')}>
                Message
              </a>
              <button className="link-button" onClick={() => removeFriend(f.id)} type="button">
                Remove
              </button>
            </li>
          ))}
          {friends.length === 0 && <p className="empty-note">Add a friend's number to message them.</p>}
        </ul>
        <form className="inline-form" onSubmit={addFriend}>
          <input placeholder="Friend's name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </section>
    </div>
  )
}
