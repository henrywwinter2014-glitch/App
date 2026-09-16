export function parseICS(text) {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
  const lines = unfolded.split(/\r\n|\n/)
  const events = []
  let current = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
    } else if (line === 'END:VEVENT') {
      if (current) events.push(current)
      current = null
    } else if (current) {
      const idx = line.indexOf(':')
      if (idx === -1) continue
      const key = line.slice(0, idx).split(';')[0]
      const value = line.slice(idx + 1)
      if (key === 'SUMMARY') current.summary = value
      if (key === 'DTSTART') current.dtstart = value
      if (key === 'UID') current.uid = value
      if (key === 'DESCRIPTION') current.description = value
    }
  }
  return events
}

export function icsDateToISO(value) {
  if (!value || value.length < 8) return ''
  const y = value.slice(0, 4)
  const m = value.slice(4, 6)
  const d = value.slice(6, 8)
  return `${y}-${m}-${d}`
}
