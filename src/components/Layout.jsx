import { useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getLogoUrl, setActiveCompanyId } from '../lib/company'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'
import { useToast } from './Toast'
import { useCompany } from '../context/CompanyContext'
import { useAuth } from '../context/AuthContext'
import { canAccess, isSuperAdmin } from '../lib/permissions'
import { useTheme } from '../lib/theme'
import CompanyWizard from './CompanyWizard'
export default function Layout() {
  const { toast } = useToast()
  const { session } = useAuth()
  const { companies, activeCompany } = useCompany()
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [showPagos, setShowPagos] = useState(false)
  const { theme, toggleTheme } = useTheme()

  const companyName = activeCompany?.company_info?.company_name || activeCompany?.display_name || 'ETG Moving Services'
  const companyDba = activeCompany?.company_info?.dba || ''
  const logoUrl = activeCompany?.logo_path ? getLogoUrl(activeCompany.logo_path) : null

  // User profile info
  const userMeta = session?.user?.user_metadata || {}
  const userName = userMeta.name || session?.user?.email || ''
  const userInitials = userMeta.name
    ? userMeta.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : session?.user?.email?.slice(0, 2).toUpperCase() || '?'
  const userAvatarUrl = userMeta.avatar_path
    ? supabase.storage.from('company-docs').getPublicUrl(userMeta.avatar_path).data?.publicUrl
    : null

  // Filter companies by allowed_companies for non-super-admins
  const allowedIds = userMeta.allowed_companies
  const visibleCompanies = isSuperAdmin(session)
    ? companies
    : (allowedIds ? companies.filter(c => allowedIds.includes(c.id)) : companies)

  // Drivers no pueden cambiar de empresa
  const isDriver = ['driver', 'driver_lease'].includes(userMeta.role)
  const canSwitchCompany = !isDriver

  async function handleSwitchCompany(id) {
    setShowSwitcher(false)
    setActiveCompanyId(id)
    window.location.href = '/'
  }

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/login')
    } catch {
      toast.error('Error al cerrar sesión')
    }
  }
  const location = useLocation()
  const navigate = useNavigate()
  const topLevelPaths = ['/', '/inicio', '/orders', '/company', '/statistics', '/settings', '/informacion', '/profiles', '/profile', '/conductores', '/pagos/conductores', '/pagos/dispatchers']
  const isSubPage = !topLevelPaths.includes(location.pathname)
  const [showMobileUserMenu, setShowMobileUserMenu] = useState(false)
  const [showMobileSwitcher, setShowMobileSwitcher] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  const allNavItems = [
    {
      to: '/',
      end: true,
      moduleKey: 'dashboard',
      label: 'Dashboard',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />,
    },
    {
      to: '/orders',
      moduleKey: 'orders',
      label: 'Ordenes',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />,
    },
    {
      to: '/company',
      moduleKey: 'company',
      label: 'Compa\u00f1\u00eda',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />,
    },
    {
      to: '/statistics',
      moduleKey: 'statistics',
      label: 'Estad\u00edsticas',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />,
    },
    {
      to: '/conductores',
      moduleKey: 'conductores',
      label: 'Conductores',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />,
    },
    {
      to: '/profiles',
      superAdminOnly: true,
      label: 'Perfiles',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />,
    },
    {
      to: '/informacion',
      moduleKey: 'informacion',
      secondary: true,
      label: 'Informaci\u00f3n',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />,
    },
  ]

  const allFiltered = allNavItems.filter(item => {
    if (item.superAdminOnly) return isSuperAdmin(session)
    if (item.moduleKey) return canAccess(session, item.moduleKey)
    return true
  })
  const navItems = allFiltered.filter(i => !i.secondary)
  const secondaryNavItems = allFiltered.filter(i => i.secondary)
  const showPagosSection = isSuperAdmin(session) || userMeta.role === 'admin'

  return (
    <div className="h-screen overflow-hidden bg-gray-950 text-gray-100 flex">
      {/* Sidebar — desktop */}
      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-30 bg-gray-900 border-r border-gray-800 flex-col ${collapsed ? 'w-16' : 'w-64'}`}
        style={{ transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {/* Company switcher header */}
        <div className="border-b border-gray-800 relative">
          <button
            onClick={canSwitchCompany ? () => setShowSwitcher(v => !v) : undefined}
            className={`w-full flex items-center gap-3 transition-colors ${canSwitchCompany ? 'hover:bg-gray-800/60 cursor-pointer' : 'cursor-default'}`}
            style={{ padding: collapsed ? '12px' : '14px 16px' }}
            title={collapsed ? companyName : undefined}
          >
            {/* Logo o iniciales */}
            <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-orange-600/20 border border-orange-600/30">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-contain p-0.5" />
              ) : (
                <span className="text-sm font-bold text-orange-400">
                  {companyName?.charAt(0)?.toUpperCase() || 'E'}
                </span>
              )}
            </div>

            <div
              className="flex-1 text-left overflow-hidden"
              style={{
                width: collapsed ? 0 : 'auto',
                opacity: collapsed ? 0 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              <p className="text-sm font-bold text-white truncate leading-tight">{companyName}</p>
              {companyDba && <p className="text-xs text-gray-500 truncate">{companyDba}</p>}
            </div>

            {!collapsed && canSwitchCompany && (
              <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
              </svg>
            )}
          </button>

          {/* Popup switcher */}
          {showSwitcher && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSwitcher(false)} />
              <div className="absolute left-0 top-full mt-1 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Empresas</p>
                  {visibleCompanies.map(c => {
                    const name = c.company_info?.company_name || c.display_name || 'Sin nombre'
                    const logo = c.logo_path ? getLogoUrl(c.logo_path) : null
                    const isActive = c.id === activeCompany?.id
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSwitchCompany(c.id)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                          isActive ? 'bg-orange-600/15 text-orange-400' : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-gray-800 border border-gray-700 shrink-0">
                          {logo ? (
                            <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
                          ) : (
                            <span className="text-xs font-bold text-gray-400">{name?.charAt(0)?.toUpperCase()}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium truncate flex-1">{name}</span>
                        {isActive && (
                          <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
                {isSuperAdmin(session) && (
                <div className="border-t border-gray-800 p-2">
                  <button
                    onClick={() => { setShowSwitcher(false); setShowWizard(true) }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-orange-400 hover:bg-orange-600/10 transition-colors font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Nueva Compañía
                  </button>
                </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* collapse button row */}
        <div className="flex justify-end px-2 py-1 border-b border-gray-800/50">
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
          className="flex-1 flex flex-col"
          style={{
            padding: collapsed ? '8px' : '16px',
            transition: 'padding 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Main nav items */}
          <div className="space-y-1">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium overflow-hidden whitespace-nowrap ${
                    isActive
                      ? 'bg-orange-600/20 text-orange-400'
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

            {/* Pagos — solo admin/super_admin */}
            {showPagosSection && (
              <div>
                <button
                  onClick={() => setShowPagos(v => !v)}
                  title={collapsed ? 'Pagos' : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium overflow-hidden whitespace-nowrap w-full ${
                    showPagos ? 'text-green-400 bg-green-600/10' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  } ${collapsed ? 'justify-center' : ''}`}
                  style={{ transition: 'color 0.2s, background 0.2s' }}
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                  </svg>
                  <span
                    className="flex-1 text-left"
                    style={{
                      width: collapsed ? 0 : 'auto',
                      opacity: collapsed ? 0 : 1,
                      transition: 'opacity 0.2s ease',
                      overflow: 'hidden',
                    }}
                  >
                    Pagos
                  </span>
                  {!collapsed && (
                    <svg
                      className="w-4 h-4 shrink-0"
                      style={{
                        transform: showPagos ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  )}
                </button>

                {/* Animated sub-menu */}
                <div
                  style={{
                    maxHeight: showPagos && !collapsed ? '120px' : '0px',
                    overflow: 'hidden',
                    transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <div className="mt-1 ml-4 space-y-1 border-l border-gray-700/60 pl-3 pb-1">
                    <NavLink
                      to="/pagos/conductores"
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive ? 'text-green-400 bg-green-600/10' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`
                      }
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      Pago Conductores
                    </NavLink>
                    <NavLink
                      to="/pagos/dispatchers"
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive ? 'text-green-400 bg-green-600/10' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`
                      }
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                      </svg>
                      Pago Dispatchers
                    </NavLink>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Secondary nav items (Configuración, Información) — pushed to bottom */}
          <div className="mt-auto pt-2 space-y-1 border-t border-gray-800/60" style={{ marginTop: '16px' }}>
            {secondaryNavItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium overflow-hidden whitespace-nowrap ${
                    isActive
                      ? 'bg-orange-600/20 text-orange-400'
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
          </div>
        </nav>

        <div
          className="border-t border-gray-800 overflow-hidden"
          style={{
            padding: collapsed ? '8px' : '16px',
            transition: 'padding 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* User profile + theme toggle */}
          <div className={`flex items-center gap-1 mb-1 ${collapsed ? 'flex-col' : ''}`}>
            <button
              onClick={() => navigate('/profile')}
              title={collapsed ? userName : undefined}
              className={`flex items-center gap-3 flex-1 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors min-w-0 ${collapsed ? 'justify-center w-full' : ''}`}
            >
              <div
                className="rounded-full overflow-hidden relative flex items-center justify-center font-bold text-white shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #ea580c, #c2410c)',
                  width: collapsed ? '36px' : '28px',
                  height: collapsed ? '36px' : '28px',
                  fontSize: collapsed ? '13px' : '11px',
                  transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {userInitials}
                {userAvatarUrl && <img src={userAvatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              </div>
              <span
                className="text-sm text-gray-400 truncate flex-1 text-left"
                style={{
                  width: collapsed ? 0 : 'auto',
                  opacity: collapsed ? 0 : 1,
                  transition: 'opacity 0.2s ease',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                {userName}
              </span>
            </button>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="p-2 rounded-lg text-gray-400 hover:text-yellow-400 hover:bg-gray-800 transition-colors shrink-0"
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
              )}
            </button>
          </div>

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

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}
        style={{ transition: 'margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {/* Mobile top bar */}
        <header className="lg:hidden relative flex items-center h-14 px-4 border-b border-gray-800 bg-gray-900 shrink-0">
          {isSubPage ? (
            <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors p-1 -ml-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={canSwitchCompany ? () => setShowMobileSwitcher(v => !v) : undefined}
              className="flex items-center gap-2 -ml-1 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-orange-600/20 border border-orange-600/30 shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="w-full h-full object-contain p-0.5" />
                ) : (
                  <span className="text-xs font-bold text-orange-400">{companyName?.charAt(0)?.toUpperCase() || 'E'}</span>
                )}
              </div>
              <span className="text-sm font-semibold text-white truncate max-w-[140px]">{companyName}</span>
              {canSwitchCompany && (
                <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                </svg>
              )}
            </button>
          )}

          <div className="flex-1" />

          {/* User avatar */}
          <button
            onClick={() => setShowMobileUserMenu(v => !v)}
            className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-xs shrink-0"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
          >
            {userInitials}
            {userAvatarUrl && <img src={userAvatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          </button>

          {/* User dropdown */}
          {showMobileUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMobileUserMenu(false)} />
              <div className="absolute top-full right-3 mt-1 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-gray-800">
                  <p className="text-sm font-semibold text-white truncate">{userName}</p>
                  <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => { setShowMobileUserMenu(false); navigate('/profile') }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                    Perfil
                  </button>
                  <button
                    onClick={() => { toggleTheme(); setShowMobileUserMenu(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    {theme === 'dark' ? (
                      <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                      </svg>
                    )}
                    Modo {theme === 'dark' ? 'Claro' : 'Oscuro'}
                  </button>
                  <div className="border-t border-gray-800 my-1" />
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                    </svg>
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Company switcher dropdown */}
          {showMobileSwitcher && !isSubPage && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMobileSwitcher(false)} />
              <div className="absolute top-full left-3 mt-1 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Empresas</p>
                  {visibleCompanies.map(c => {
                    const name = c.company_info?.company_name || c.display_name || 'Sin nombre'
                    const logo = c.logo_path ? getLogoUrl(c.logo_path) : null
                    const isActive = c.id === activeCompany?.id
                    return (
                      <button
                        key={c.id}
                        onClick={() => { setShowMobileSwitcher(false); handleSwitchCompany(c.id) }}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                          isActive ? 'bg-orange-600/15 text-orange-400' : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-gray-800 border border-gray-700 shrink-0">
                          {logo ? (
                            <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
                          ) : (
                            <span className="text-xs font-bold text-gray-400">{name?.charAt(0)?.toUpperCase()}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium truncate flex-1">{name}</span>
                        {isActive && (
                          <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
                {isSuperAdmin(session) && (
                  <div className="border-t border-gray-800 p-2">
                    <button
                      onClick={() => { setShowMobileSwitcher(false); setShowWizard(true) }}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-orange-400 hover:bg-orange-600/10 transition-colors font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Nueva Compañía
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </header>

        <main className="flex-1 min-h-0 p-3 sm:p-6 overflow-auto pb-20 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav bar */}
      {(() => {
        const hasDashboard = isSuperAdmin(session) || canAccess(session, 'dashboard')

        const allItems = [
          { to: '/inicio', label: 'Inicio', end: true, icon: <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /> },
          canAccess(session, 'orders') && { to: '/orders', label: 'Ordenes', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /> },
          canAccess(session, 'conductores') && { to: '/conductores', label: 'Conductores', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /> },
          canAccess(session, 'company') && { to: '/company', label: 'Compañía', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" /> },
        ].filter(Boolean)

        const half = Math.ceil(allItems.length / 2)
        const leftItems = hasDashboard ? allItems.slice(0, half) : allItems
        const rightItems = hasDashboard ? allItems.slice(half) : []

        const NavItem = ({ item }) => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to)
          return (
            <NavLink to={item.to} end={item.end} className="flex flex-col items-center justify-end gap-1 pb-3 pt-2 flex-1 min-w-0">
              <div className="relative flex items-center justify-center mb-0.5">
                {isActive && (
                  <span className="absolute -top-[10px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full" style={{ background: '#f97316' }} />
                )}
                <svg
                  className="w-[22px] h-[22px] shrink-0"
                  style={{ color: isActive ? '#f97316' : '#6b7280' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={isActive ? 2 : 1.5}
                >
                  {item.icon}
                </svg>
              </div>
              <span className="text-[10px] font-medium leading-none" style={{ color: isActive ? '#f97316' : '#4b5563' }}>
                {item.label}
              </span>
            </NavLink>
          )
        }

        return (
          <nav
            className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-end"
            style={{
              background: 'rgba(9,9,14,0.97)',
              backdropFilter: 'blur(24px)',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {leftItems.map(item => <NavItem key={item.to} item={item} />)}

            {/* Center — Dashboard elevated button (solo si tiene acceso) */}
            {hasDashboard && (
              <div className="flex flex-col items-center flex-1 pb-2">
                <NavLink
                  to="/"
                  end
                  className="flex flex-col items-center gap-1.5"
                  style={{ marginTop: '-20px' }}
                >
                  {({ isActive: navActive }) => {
                  const isActive = navActive || location.pathname.startsWith('/truck/')
                  return (
                    <>
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center active:scale-95"
                        style={{
                          background: isActive
                            ? 'linear-gradient(145deg, #ea580c, #b91c1c)'
                            : 'linear-gradient(145deg, #1c1c28, #13131e)',
                          boxShadow: isActive
                            ? '0 8px 24px rgba(234,88,12,0.5), 0 2px 8px rgba(0,0,0,0.5)'
                            : '0 4px 16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
                          border: isActive
                            ? '1.5px solid rgba(234,88,12,0.45)'
                            : '1.5px solid rgba(255,255,255,0.07)',
                          transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                        }}
                      >
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive ? 2 : 1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-semibold leading-none" style={{ color: isActive ? '#f97316' : '#6b7280' }}>Dashboard</span>
                    </>
                  )}}
                </NavLink>
              </div>
            )}

            {rightItems.map(item => <NavItem key={item.to} item={item} />)}
          </nav>
        )
      })()}

      {/* Company Wizard */}
      {showWizard && (
        <CompanyWizard
          onClose={() => setShowWizard(false)}
          onCreated={() => setShowWizard(false)}
        />
      )}

    </div>
  )
}
