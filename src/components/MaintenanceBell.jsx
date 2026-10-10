import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { getActiveCompanyId } from '../lib/company'
import { truckTypeInfo } from '../lib/trucks'
import { loadMaintenance, pendingAlerts, markAlertsRead, notifyMaintenanceChanged, alertMessage, LEVEL_STYLES } from '../lib/maintenance'

const REFRESH_MS = 5 * 60 * 1000
const TOASTED_KEY = 'maintenance-toasted'

/**
 * Bell with the maintenance alerts still unread by this user (super admin, admins
 * and the driver of the truck). Yellow = early notice, red = service due. Reading
 * one (clicking it) marks it read; a new service cycle or going from yellow to red
 * is a new alert. In-app only, no emails.
 */
export default function MaintenanceBell() {
  const { session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await loadMaintenance(session, getActiveCompanyId())
      setData(next)
      // On the first sight of unread alerts, a heads-up at the top of the screen
      const fresh = pendingAlerts(next)
      let seen = []
      try { seen = JSON.parse(sessionStorage.getItem(TOASTED_KEY) || '[]') } catch { /* private mode */ }
      const unseen = fresh.filter(t => !seen.includes(t.key))
      if (unseen.length) {
        const critical = unseen.some(t => t.summary.level === 'critical')
        const msg = unseen.length === 1
          ? `${unseen[0].name}: ${alertMessage(unseen[0].summary)}`
          : `${unseen.length} alertas de mantenimiento pendientes`
        critical ? toast.error(msg) : toast.warning(msg)
        try { sessionStorage.setItem(TOASTED_KEY, JSON.stringify([...seen, ...unseen.map(t => t.key)])) } catch { /* private mode */ }
      }
    } catch (err) {
      console.warn('[maintenance bell]', err)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    window.addEventListener('focus', load)
    window.addEventListener('maintenance:changed', load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', load)
      window.removeEventListener('maintenance:changed', load)
    }
  }, [load])

  const alerts = data ? pendingAlerts(data) : []

  async function openAlert(t) {
    setOpen(false)
    await markAlertsRead(session, [t.key])
    notifyMaintenanceChanged()
    navigate(`/mantenimiento?truck=${t.id}`)
  }

  async function readAll() {
    await markAlertsRead(session, alerts.map(t => t.key))
    notifyMaintenanceChanged()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Notificaciones de mantenimiento"
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {alerts.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${alerts.some(t => t.summary.level === 'critical') ? 'bg-red-600' : 'bg-amber-500'}`}>
            {alerts.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-[min(22rem,92vw)] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
              <p className="text-sm font-semibold text-white">Notificaciones</p>
              {alerts.length > 0 && (
                <button onClick={readAll} className="text-[11px] text-gray-500 hover:text-orange-400 transition-colors">Marcar todas como leídas</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-gray-600">Sin notificaciones pendientes</p>
              ) : alerts.map(t => {
                const st = LEVEL_STYLES[t.summary.level]
                const type = truckTypeInfo(t.truck_type)
                return (
                  <button key={t.key} onClick={() => openAlert(t)} className="w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-800/60 transition-colors border-b border-gray-800/60 last:border-b-0">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">Truck {t.number} — {t.name}</span>
                        {type && <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${type.badge}`}>{type.label}</span>}
                      </span>
                      <span className={`block text-xs mt-0.5 ${st.text}`}>{alertMessage(t.summary)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <button onClick={() => { setOpen(false); navigate('/mantenimiento') }} className="w-full px-4 py-2.5 text-xs font-medium text-orange-400 hover:bg-gray-800/60 border-t border-gray-800 transition-colors">
              Ver mantenimiento
            </button>
          </div>
        </>
      )}
    </div>
  )
}
