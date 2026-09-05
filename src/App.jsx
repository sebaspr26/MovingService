import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import TruckView from './components/TruckView'
import OrdersView from './components/OrdersView'
import OrderDetail from './components/OrderDetail'
import CompanyInfo from './components/CompanyInfo'
import Informacion from './components/InfoDrawer'
import Settings from './components/Settings'
import Statistics from './components/Statistics'
import Login from './components/Login'
import Profiles from './components/Profiles'
import SetPassword from './components/SetPassword'
import ComingSoon from './components/ComingSoon'
import { useAuth } from './context/AuthContext'


function ProtectedRoute({ children }) {
  const { session } = useAuth()

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Navigate to={import.meta.env.PROD ? '/maintenance' : '/login'} replace />

  // Usuario invitado que aún no ha configurado su contraseña
  if (session.user?.user_metadata?.needs_password) {
    return <Navigate to="/set-password" replace />
  }

  return children
}

function App() {
  const { session } = useAuth()

  return (
    <BrowserRouter>
      <Routes>
        {/* /login solo accesible si sabes la URL — muestra mantenimiento si no hay sesión y van a / */}
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/maintenance" element={<ComingSoon />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="truck/:id" element={<TruckView />} />
          <Route path="orders" element={<OrdersView />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="company" element={<CompanyInfo />} />
          <Route path="statistics" element={<Statistics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profiles" element={<Profiles />} />
          <Route path="informacion" element={<Informacion />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
