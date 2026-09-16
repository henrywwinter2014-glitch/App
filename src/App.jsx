import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar.jsx'
import Home from './pages/Home.jsx'
import Sleep from './pages/Sleep.jsx'
import Football from './pages/Football.jsx'
import Tricks from './pages/Tricks.jsx'

export default function App() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sleep" element={<Sleep />} />
          <Route path="/football" element={<Football />} />
          <Route path="/tricks" element={<Tricks />} />
        </Routes>
      </main>
      <NavBar />
    </div>
  )
}
