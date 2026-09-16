import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar.jsx'
import Home from './pages/Home.jsx'
import Sleep from './pages/Sleep.jsx'
import Football from './pages/Football.jsx'
import Tricks from './pages/Tricks.jsx'
import More from './pages/More.jsx'
import Homework from './pages/Homework.jsx'
import Strength from './pages/Strength.jsx'
import Outfits from './pages/Outfits.jsx'
import Messages from './pages/Messages.jsx'

export default function App() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sleep" element={<Sleep />} />
          <Route path="/football" element={<Football />} />
          <Route path="/tricks" element={<Tricks />} />
          <Route path="/more" element={<More />} />
          <Route path="/homework" element={<Homework />} />
          <Route path="/strength" element={<Strength />} />
          <Route path="/outfits" element={<Outfits />} />
          <Route path="/messages" element={<Messages />} />
        </Routes>
      </main>
      <NavBar />
    </div>
  )
}
