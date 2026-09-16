const FIXTURES = [
  { date: 'Sat 20 Sep', opponent: 'Manchester City', venue: 'Home', competition: 'Premier League' },
  { date: 'Tue 23 Sep', opponent: 'Port Vale', venue: 'Away', competition: 'League Cup' },
  { date: 'Sat 27 Sep', opponent: 'Newcastle United', venue: 'Away', competition: 'Premier League' },
  { date: 'Wed 1 Oct', opponent: 'Olympiacos', venue: 'Home', competition: 'Champions League' },
]

const LEAGUE_TABLE = [
  { pos: 1, team: 'Liverpool', played: 5, points: 13 },
  { pos: 2, team: 'Arsenal', played: 5, points: 12 },
  { pos: 3, team: 'Manchester City', played: 5, points: 11 },
  { pos: 4, team: 'Tottenham Hotspur', played: 5, points: 10 },
  { pos: 5, team: 'Chelsea', played: 5, points: 9 },
]

export default function Football() {
  return (
    <div className="page">
      <h1>Arsenal &amp; football</h1>
      <p className="empty-note">Sample data for now — swap in a live football API when you're ready.</p>

      <section className="card">
        <h2>Fixtures</h2>
        <ul className="list">
          {FIXTURES.map((f) => (
            <li key={f.date + f.opponent} className="list-row fixture-row">
              <div>
                <strong>{f.opponent}</strong>
                <div className="fixture-meta">{f.competition} · {f.venue}</div>
              </div>
              <span>{f.date}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>League table</h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {LEAGUE_TABLE.map((row) => (
              <tr key={row.team} className={row.team === 'Arsenal' ? 'row-highlight' : ''}>
                <td>{row.pos}</td>
                <td>{row.team}</td>
                <td>{row.played}</td>
                <td>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
