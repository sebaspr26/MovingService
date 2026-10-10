import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast, friendlyError } from './Toast'
import { getActiveCompanyId } from '../lib/company'
import { canAccess } from '../lib/permissions'
import { truckTypeInfo } from '../lib/trucks'
import { loadMaintenance, allAlerts, markAlertsRead, notifyMaintenanceChanged, fmtMi, LEVEL_STYLES } from '../lib/maintenance'
import { AlertItem } from './MaintenanceBell'

/**
 * Notificaciones: every maintenance notification of the user's trucks (the bell only
 * shows the first 5). Yellow = the truck is getting close to its next service, red =
 * it went past the limit. Opening one marks it read.
 */
export default function Notifications() {
  const { session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const canService = canAccess(session, 'mantenimiento', 'configurar')
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await loadMaintenance(session, getActiveCompanyId()))
    } catch (err) {
      toast.error(friendlyError(err.message))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  useEffect(() => {
    load()
    window.addEventListener('maintenance:changed', load)
    return () => window.removeEventListener('maintenance:changed', load)
  }, [load])

  const alerts = data ? allAlerts(data) : []
  const unread = alerts.filter(t => !t.read)

  async function open(t, extra = '') {
    if (!t.read) {
      await markAlertsRead(session, [t.key])
      notifyMaintenanceChanged()
    }
    navigate(`/mantenimiento?truck=${t.id}${extra}`)
  }

  async function readAll() {
    await markAlertsRead(session, unread.map(t => t.key))
    notifyMaintenanceChanged()
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data ? `${alerts.length} notificación${alerts.length !== 1 ? 'es' : ''}${unread.length ? ` · ${unread.length} sin leer` : ''}` : 'Cargando...'}
          </p>
        </div>
        {unread.length > 0 && (
          <button onClick={readAll} className="self-start sm:self-auto text-xs text-gray-500 hover:text-orange-400 transition-colors">Marcar todas como leídas</button>
        )}
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-20 text-gray-500 text-sm">
          Sin notificaciones
          <p className="text-xs text-gray-600 mt-1">Aquí aparecen los camiones que se acercan a su mantenimiento o ya se pasaron.</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {alerts.map(t => {
            const st = LEVEL_STYLES[t.summary.level]
            const type = truckTypeInfo(t.truck_type)
            return (
              <div key={t.key} className={`bg-gray-900 border rounded-xl overflow-hidden ${t.read ? 'border-gray-800' : st.soft}`}>
                <AlertItem t={t} onClick={() => open(t)} />
                <div className="flex items-center flex-wrap gap-2 px-4 pb-3 pl-9">
                  {type && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${type.badge}`}>{type.label}</span>}
                  <span className="text-[11px] text-gray-600">{fmtMi(t.summary.total)} / {fmtMi(t.summary.interval)} mi</span>
                  <span className="flex-1" />
                  <button onClick={() => open(t)} className="text-xs text-gray-400 hover:text-orange-300 transition-colors">Ver detalle</button>
                  {canService && (
                    <button onClick={() => open(t, '&service=1')} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors">
                      Mantenimiento realizado
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
