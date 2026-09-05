import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getCompanySettings } from '../lib/company'
import { signOut } from '../lib/auth'
import { useToast } from './Toast'

export default function Layout() {
  const [companyName, setCompanyName] = useState('ETG Moving Services')
  const [companyDba, setCompanyDba] = useState('Driving Is Work LLC')
  const { toast } = useToast()

  async function handleSignOut() {
    const confirmed = await toast.confirm('¿Cerrar sesión?')
    if (!confirmed) return
    try {
      await signOut()
    } catch {
      toast.error('Error al cerrar sesión')
    }
  }

  useEffect(() => {
    getCompanySettings().then(s => {
      const info = s?.company_info || {}
      if (info.company_name) setCompanyName(info.company_name)
      if (info.dba) setCompanyDba(info.dba)
    })
  }, [])
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = location.pathname !== '/' && location.pathname !== '/orders' && location.pathname !== '/company' && location.pathname !== '/statistics' && location.pathname !== '/settings'
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  const navItems = [
    {
      to: '/',
      end: true,
      label: 'Dashboard',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />,
    },
    {
      to: '/orders',
      label: 'Ordenes',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />,
    },
    {
      to: '/company',
      label: 'Compa\u00f1\u00eda',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />,
    },
    {
      to: '/statistics',
      label: 'Estad\u00edsticas',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />,
    },
    {
      to: '/profiles',
      label: 'Perfiles',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />,
    },
    {
      to: '/settings',
      label: 'Configuraci\u00f3n',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />,
    },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar — desktop */}
      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-30 bg-gray-900 border-r border-gray-800 flex-col ${collapsed ? 'w-16' : 'w-64'}`}
        style={{ transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <div
          className="border-b border-gray-800 flex items-center overflow-hidden"
          style={{
            padding: collapsed ? '12px' : '24px',
            justifyContent: collapsed ? 'center' : 'space-between',
            transition: 'padding 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            className="overflow-hidden whitespace-nowrap"
            style={{
              width: collapsed ? 0 : 180,
              opacity: collapsed ? 0 : 1,
              transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
            }}
          >
            <h1 className="text-xl font-bold text-white tracking-tight">{companyName}</h1>
            <p className="text-xs text-gray-500 mt-1">{companyDba}</p>
          </div>
          <button
            onClick={toggleCollapsed}
            className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 shrink-0"
            style={{ transition: 'color 0.2s, background 0.2s' }}
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            <svg
              className="w-4 h-4"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              style={{
                transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>

        <nav
          className="flex-1 space-y-1"
          style={{
            padding: collapsed ? '8px' : '16px',
            transition: 'padding 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium overflow-hidden whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                } ${collapsed ? 'justify-center' : ''}`
              }
              style={{ transition: 'color 0.2s, background 0.2s' }}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {item.icon}
              </svg>
              <span
                style={{
                  width: collapsed ? 0 : 'auto',
                  opacity: collapsed ? 0 : 1,
                  transition: 'opacity 0.2s ease',
                  overflow: 'hidden',
                }}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div
          className="border-t border-gray-800 overflow-hidden"
          style={{
            padding: collapsed ? '8px' : '16px',
            transition: 'padding 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <button
            onClick={handleSignOut}
            title="Cerrar sesión"
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            <span
              style={{
                width: collapsed ? 0 : 'auto',
                opacity: collapsed ? 0 : 1,
                transition: 'opacity 0.2s ease',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              Cerrar Sesión
            </span>
          </button>
          <p
            className="text-xs text-gray-600 whitespace-nowrap mt-2"
            style={{
              opacity: collapsed ? 0.7 : 1,
              transition: 'opacity 0.2s ease',
              textAlign: collapsed ? 'center' : 'left',
            }}
          >
            {collapsed ? 'v1.4' : 'v1.4 - Fase 5'}
          </p>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-40 ${menuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
      >
        <div
          className="absolute inset-0 bg-black/60"
          style={{
            opacity: menuOpen ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
        <aside
          className="absolute inset-y-0 left-0 w-72 bg-gray-900 border-r border-gray-800 flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">{companyName}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{companyDba}</p>
            </div>
            <button onClick={() => setMenuOpen(false)} className="text-gray-500 hover:text-white transition-colors p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`
                }
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {item.icon}
                </svg>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-800 space-y-2">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              Cerrar Sesión
            </button>
            <p className="text-xs text-gray-600">v1.4 - Fase 5</p>
          </div>
        </aside>
      </div>

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}
        style={{ transition: 'margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
          {isSubPage ? (
            <button
              onClick={() => navigate(-1)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => setMenuOpen(true)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          )}
          <h1 className="text-lg font-bold text-white flex-1">{companyName}</h1>
        </header>

        <main className="flex-1 p-3 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
