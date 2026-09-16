export function loadState(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function saveState(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable, ignore
  }
}
