import { useEffect, useState } from 'react'
import { loadState, saveState } from '../storage.js'

const FRIENDS_KEY = 'henry.messages.friends'

function logKey(friendId) {
  return `henry.messages.log.${friendId}`
}

function isIOS() {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function smsHref(phone, body) {
  const cleanPhone = phone.replace(/[^\d+]/g, '')
  if (!body) return `sms:${cleanPhone}`
  const separator = isIOS() ? '&' : '?'
  return `sms:${cleanPhone}${separator}body=${encodeURIComponent(body)}`
}

function initials(name) {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function Messages() {
  const [friends, setFriends] = useState(() => loadState(FRIENDS_KEY, []))
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState('')
  const [log, setLog] = useState([])

  const active = friends.find((f) => f.id === activeId) || null

  useEffect(() => {
    if (activeId) {
      setLog(loadState(logKey(activeId), []))
    }
  }, [activeId])

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

  function lastMessagePreview(friendId) {
    const entries = loadState(logKey(friendId), [])
    if (entries.length === 0) return null
    return entries[entries.length - 1]
  }

  function send() {
    if (!draft.trim() || !active) return
    const text = draft.trim()
    const next = [...log, { text, at: new Date().toISOString() }]
    setLog(next)
    saveState(logKey(active.id), next)
    setDraft('')
    window.location.href = smsHref(active.phone, text)
  }

  if (active) {
    return (
      <div className="page">
        <div className="chat-header">
          <button className="link-button back-link" onClick={() => setActiveId(null)} type="button">
            ← Back
          </button>
          <div className="chat-header-name">
            <span className="chat-avatar">{initials(active.name)}</span>
            <h1>{active.name}</h1>
          </div>
          <a className="link-button" href={smsHref(active.phone, '')}>
            Open in Messages
          </a>
        </div>

        <p className="empty-note">
          Shows what you've sent from here — for their replies and the full conversation, check the
          Messages app.
        </p>

        <div className="chat-log">
          {log.length === 0 && <p className="empty-note">No messages sent from here yet.</p>}
          {log.map((m, i) => (
            <div className="chat-bubble-row" key={i}>
              <div className="chat-bubble">
                {m.text}
                <span className="chat-bubble-time">{formatTime(m.at)}</span>
              </div>
            </div>
          ))}
        </div>

        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            placeholder="Text message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="chat-send" type="submit" aria-label="Send">
            ➤
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Messages</h1>
      <p className="empty-note">Sending goes through your iPhone's real Messages app.</p>

      <section className="card">
        <h2>Friends</h2>
        <ul className="list chat-friend-list">
          {friends.map((f) => {
            const last = lastMessagePreview(f.id)
            return (
              <li key={f.id} className="chat-friend-row">
                <button className="chat-friend-button" onClick={() => setActiveId(f.id)} type="button">
                  <span className="chat-avatar">{initials(f.name)}</span>
                  <span className="chat-friend-info">
                    <span className="chat-friend-name">{f.name}</span>
                    <span className="chat-friend-preview">{last ? last.text : 'No messages yet'}</span>
                  </span>
                </button>
                <button className="link-button" onClick={() => removeFriend(f.id)} type="button">
                  Remove
                </button>
              </li>
            )
          })}
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
