import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccess, isSuperAdmin } from '../lib/permissions'
import { supabase } from '../lib/supabase'

const NAV_CARDS = [
  {
    to: '/',
    label: 'Dashboard',
    description: 'Camiones, ciclos y balance',
    iconColor: '#ea580c',
    bg: 'rgba(234,88,12,0.1)',
    border: 'rgba(234,88,12,0.25)',
    moduleKey: 'dashboard',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />,
  },
  {
    to: '/orders',
    label: 'Ordenes',
    description: 'Cargas y envíos',
    iconColor: '#3b82f6',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.2)',
    moduleKey: 'orders',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />,
  },
  {
    to: '/company',
    label: 'Compañía',
    description: 'Choferes y camiones',
    iconColor: '#8b5cf6',
    bg: 'rgba(139,92,246,0.1)',
    border: 'rgba(139,92,246,0.25)',
    moduleKey: 'company',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />,
  },
  {
    to: '/conductores',
    label: 'Conductores',
    description: 'Rutas y pagos',
    iconColor: '#06b6d4',
    bg: 'rgba(6,182,212,0.1)',
    border: 'rgba(6,182,212,0.2)',
    moduleKey: 'conductores',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />,
  },
  {
    to: '/statistics',
    label: 'Estadísticas',
    description: 'Reportes y análisis',
    iconColor: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.2)',
    moduleKey: 'statistics',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />,
  },
  {
    to: '/pagos',
    label: 'Pagos',
    description: 'Liquidaciones',
    iconColor: '#22c55e',
    bg: 'rgba(34,197,94,0.1)',
    border: 'rgba(34,197,94,0.2)',
    adminOnly: true,
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />,
  },
  {
    to: '/profiles',
    label: 'Perfiles',
    description: 'Usuarios y roles',
    iconColor: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.2)',
    superAdminOnly: true,
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />,
  },
]

export default function Inicio() {
  const { session } = useAuth()
  const role = session?.user?.user_metadata?.role
  const name = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Usuario'
  const firstName = name.split(' ')[0]
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const avatarPath = session?.user?.user_metadata?.avatar_path
  const avatarUrl = avatarPath
    ? supabase.storage.from('company-docs').getPublicUrl(avatarPath).data?.publicUrl
    : null

  const cards = NAV_CARDS.filter(item => {
    if (item.superAdminOnly) return isSuperAdmin(session)
    if (item.adminOnly) return isSuperAdmin(session) || role === 'admin'
    if (item.moduleKey) return canAccess(session, item.moduleKey)
    return true
  })

  return (
    <div className="flex flex-col items-center pt-4 pb-2">
      {/* Avatar + saludo */}
      <div className="flex flex-col items-center text-center mb-8">
        <div
          className="w-20 h-20 rounded-full overflow-hidden relative flex items-center justify-center text-2xl font-bold text-white mb-4 shrink-0"
          style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 8px 32px rgba(234,88,12,0.35)' }}
        >
          {initials}
          {avatarUrl && <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        </div>
        <h1 className="text-3xl font-bold text-white leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Bienvenido,{' '}
          <span style={{ background: 'linear-gradient(135deg, #ea580c, #fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {firstName}
          </span>
        </h1>
        <p className="text-gray-500 text-sm mt-1.5">¿Qué vas a gestionar hoy?</p>
      </div>

      {/* Cards grid */}
      {cards.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 text-sm">No tienes módulos asignados.</p>
          <p className="text-gray-700 text-xs mt-1">Contacta al administrador.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 w-full">
          {cards.map(card => (
            <Link
              key={card.to}
              to={card.to}
              className="group relative flex flex-col gap-3 p-4 rounded-2xl transition-all active:scale-95"
              style={{ background: card.bg, border: `1px solid ${card.border}` }}
            >
              {/* Flecha */}
              <svg className="absolute top-3.5 right-3.5 w-3.5 h-3.5 opacity-40 group-active:opacity-70 transition-opacity" style={{ color: card.iconColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              {/* Icono */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: `rgba(128,128,128,0.15)`, border: `1px solid ${card.border}` }}
              >
                <svg className="w-5 h-5" style={{ color: card.iconColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {card.icon}
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-tight">{card.label}</p>
                <p className="text-xs mt-0.5 leading-snug text-gray-500">{card.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
