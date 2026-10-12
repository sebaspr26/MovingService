import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { getActiveCompanyId } from '../lib/company'
import {
  refreshMaintenance, getMaintenanceCache, pendingAlerts, allAlerts, markAlertsRead, notifyMaintenanceChanged, alertMessage, LEVEL_STYLES,
} from '../lib/maintenance'

const REFRESH_MS = 5 * 60 * 1000
const TOASTED_KEY = 'maintenance-toasted'
const BELL_LIMIT = 5

/**
 * Notification item shared by the bell and the Notificaciones page: the truck's state
 * in one sentence (yellow = getting close, red = past the limit), dimmed once read.
 */
export function AlertItem({ t, onClick, compact = false }) {
  const st = LEVEL_STYLES[t.summary.level]
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex gap-3 hover:bg-gray-800/60 transition-colors ${compact ? 'px-4 py-3 border-b border-gray-800/60 last:border-b-0' : 'p-4'}`}
    >
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${t.read ? 'bg-gray-700' : st.dot}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug ${t.read ? 'text-gray-500' : st.text}`}>{alertMessage(t.summary, t.name)}</span>
        <span className="block text-[11px] mt-1 text-gray-600">Truck {t.number}{t.read ? ' · leída' : ''}</span>
      </span>
    </button>
  )
}

/**
 * Bell with the maintenance notifications of the trucks this user can see (super admin,
 * admins and the driver of the truck, when allowed in Perfiles). It lists up to 5 (unread
 * first); the rest are in the Notificaciones page. Opening one marks it read. In-app only.
 */
export default function MaintenanceBell() {
  const { session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState(() => getMaintenanceCache(session, getActiveCompanyId()))
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [panelPos, setPanelPos] = useState(null)

  // The panel is placed from the bell's position, in a portal: on a phone it spans the
  // screen (12px each side) instead of hanging off the bell and leaving the screen
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const w = window.innerWidth
      setPanelPos(w < 640
        ? { left: 12, right: 12, top: r.bottom + 8, origin: `${Math.max(0, r.left + r.width / 2 - 12)}px top` }
        : { right: Math.max(12, w - r.right), top: r.bottom + 8, width: 384, origin: 'right top' })
    }
    setOpen(v => !v)
  }

  const load = useCallback(async () => {
    try {
      const next = await refreshMaintenance(session, getActiveCompanyId())
      setData(next)
      // On the first sight of unread alerts, a heads-up at the top of the screen
      const fresh = pendingAlerts(next)
      let seen = []
      try { seen = JSON.parse(sessionStorage.getItem(TOASTED_KEY) || '[]') } catch { /* private mode */ }
      const unseen = fresh.filter(t => !seen.includes(t.key))
      if (unseen.length) {
        const critical = unseen.some(t => t.summary.level === 'critical')
        const msg = unseen.length === 1
          ? alertMessage(unseen[0].summary, unseen[0].name)
          : `${unseen.length} notificaciones de mantenimiento pendientes`
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

  const alerts = data ? allAlerts(data) : []
  const unread = alerts.filter(t => !t.read)
  const shown = alerts.slice(0, BELL_LIMIT)

  async function openAlert(t) {
    setOpen(false)
    if (!t.read) {
      await markAlertsRead(session, [t.key])
      notifyMaintenanceChanged()
    }
    navigate(`/mantenimiento?truck=${t.id}`)
  }

  async function readAll() {
    await markAlertsRead(session, unread.map(t => t.key))
    notifyMaintenanceChanged()
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        title="Notificaciones"
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 active:scale-90 transition-all"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unread.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${unread.some(t => t.summary.level === 'critical') ? 'bg-red-600' : 'bg-amber-500'}`}>
            {unread.length}
          </span>
        )}
      </button>

      {open && panelPos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-bell-panel"
            style={{ left: panelPos.left, right: panelPos.right, top: panelPos.top, width: panelPos.width, transformOrigin: panelPos.origin, maxHeight: `calc(100vh - ${panelPos.top + 12}px)`, overflowY: 'auto' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
              <p className="text-sm font-semibold text-white">Notificaciones</p>
              {unread.length > 0 && (
                <button onClick={readAll} className="text-[11px] text-gray-500 hover:text-orange-400 transition-colors">Marcar todas como leídas</button>
              )}
            </div>
            <div>
              {shown.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-gray-600">Sin notificaciones</p>
              ) : shown.map(t => <AlertItem key={t.key} t={t} compact onClick={() => openAlert(t)} />)}
            </div>
            {alerts.length > BELL_LIMIT && (
              <button onClick={() => { setOpen(false); navigate('/notificaciones') }} className="w-full px-4 py-2.5 text-xs font-medium text-orange-400 hover:bg-gray-800/60 border-t border-gray-800 transition-colors">
                Ver más ({alerts.length - BELL_LIMIT})
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
