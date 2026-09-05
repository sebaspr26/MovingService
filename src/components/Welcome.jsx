import { useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { getLogoUrl } from '../lib/company'
import { accessibleModules } from '../lib/permissions'
import { supabase } from '../lib/supabase'

function getAvatarUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('company-docs').getPublicUrl(path)
  return data?.publicUrl || null
}

const MODULE_ROUTES = {
  dashboard: '/',
  orders: '/orders',
  statistics: '/statistics',
  company: '/company',
  informacion: '/informacion',
  settings: '/settings',
}

const MODULE_DESCRIPTIONS = {
  dashboard: 'Camiones, ciclos y balance general',
  orders: 'Gestión de cargas y ordenes de transporte',
  statistics: 'Reportes y análisis del negocio',
  company: 'Choferes, camiones, trailers y documentos',
  informacion: 'Datos de la empresa y facturación',
  settings: 'Preferencias del sistema',
}

export default function Welcome() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { activeCompany } = useCompany()

  const name = session?.user?.user_metadata?.name || ''
  const firstName = name.split(' ')[0] || 'bienvenido'
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : session?.user?.email?.slice(0, 2).toUpperCase() || '?'
  const userAvatarUrl = getAvatarUrl(session?.user?.user_metadata?.avatar_path)

  const companyName = activeCompany?.company_info?.company_name || activeCompany?.display_name || ''
  const logoUrl = activeCompany?.logo_path ? getLogoUrl(activeCompany.logo_path) : null

  const modules = accessibleModules(session)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60">
        {/* Logo empresa */}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 max-w-[120px] object-contain" />
          ) : (
            <span className="text-sm font-bold text-white">{companyName}</span>
          )}
        </div>

        {/* Avatar + cerrar sesión */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
          >
            {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
          </div>
          <button
            onClick={handleSignOut}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            Salir
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* Saludo */}
        <div className="text-center mb-12">
          <div
            className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold text-white mx-auto mb-6"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 8px 32px rgba(234,88,12,0.35)' }}
          >
            {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3" style={{ letterSpacing: '-0.03em' }}>
            Bienvenido, <span style={{ background: 'linear-gradient(135deg, #ea580c, #fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{firstName}</span>
          </h1>
          <p className="text-gray-500 text-base">¿Qué vas a gestionar hoy?</p>
        </div>

        {/* Cards de módulos */}
        <div className={`grid gap-4 w-full max-w-3xl ${
          modules.length === 1 ? 'grid-cols-1 max-w-xs' :
          modules.length === 2 ? 'grid-cols-2 max-w-lg' :
          modules.length === 3 ? 'grid-cols-3' :
          modules.length === 4 ? 'grid-cols-2 max-w-2xl' :
          'grid-cols-2 sm:grid-cols-3'
        }`}>
          {modules.map(mod => (
            <button
              key={mod.key}
              onClick={() => navigate(MODULE_ROUTES[mod.key] || '/')}
              className="group relative flex flex-col items-start gap-4 p-6 rounded-2xl border border-gray-800 bg-gray-900 hover:border-orange-600/40 hover:bg-gray-800/80 transition-all text-left"
              style={{ transition: 'border-color 0.2s, background 0.2s, transform 0.15s, box-shadow 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(234,88,12,0.12)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              {/* Icono */}
              <div className="w-12 h-12 rounded-xl bg-orange-600/10 border border-orange-600/20 flex items-center justify-center group-hover:bg-orange-600/20 transition-colors">
                <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={mod.icon} />
                </svg>
              </div>

              {/* Texto */}
              <div>
                <p className="text-base font-bold text-white mb-1">{mod.label}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{MODULE_DESCRIPTIONS[mod.key] || ''}</p>
              </div>

              {/* Flecha */}
              <div className="absolute top-5 right-5 text-gray-700 group-hover:text-orange-500 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {modules.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-600 text-sm">No tienes módulos asignados aún.</p>
            <p className="text-gray-700 text-xs mt-1">Contacta al administrador del sistema.</p>
          </div>
        )}
      </main>
    </div>
  )
}
