import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = location.pathname !== '/'

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar — desktop only */}
      <aside className="hidden lg:flex fixed lg:static inset-y-0 left-0 z-30 w-64 bg-gray-900 border-r border-gray-800 flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white tracking-tight">ETG Moving Services</h1>
          <p className="text-xs text-gray-500 mt-1">Driving Is Work LLC</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`
            }
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
            </svg>
            Dashboard
          </NavLink>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-600">v1.1 - Fase 2</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
          {isSubPage ? (
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          ) : null}
          <h1 className="text-lg font-bold text-white">ETG Moving Services</h1>
        </header>

        <main className="flex-1 p-3 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
