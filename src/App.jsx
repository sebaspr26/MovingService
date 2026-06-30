import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import TruckView from './components/TruckView'
import OrdersView from './components/OrdersView'
import OrderDetail from './components/OrderDetail'
import CompanyInfo from './components/CompanyInfo'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="truck/:id" element={<TruckView />} />
          <Route path="orders" element={<OrdersView />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="company" element={<CompanyInfo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
