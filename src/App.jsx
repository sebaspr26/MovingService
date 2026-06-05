import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import TruckView from './components/TruckView'
import Scanner from './components/Scanner'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="truck/:id" element={<TruckView />} />
          <Route path="scanner" element={<Scanner />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
