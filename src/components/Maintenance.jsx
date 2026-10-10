import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast, friendlyError } from './Toast'
import { getActiveCompanyId } from '../lib/company'
import { canAccess } from '../lib/permissions'
import { truckTypeInfo, NO_TRUCK_TYPE_LABEL } from '../lib/trucks'
import {
  loadMaintenance, markAlertsRead, notifyMaintenanceChanged, saveMaintenanceConfig, registerService,
  fetchServiceLogs, alertMessage, fmtMi, LEVEL_STYLES,
} from '../lib/maintenance'
import DatePicker from './DatePicker'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate = d => {
  if (!d) return '—'
  const [y, m, day] = String(d).split('T')[0].split('-')
  return `${m}/${day}/${y}`
}

function TypeBadge({ type }) {
  const info = truckTypeInfo(type)
  return info
    ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${info.badge}`}>{info.label}</span>
    : <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-700 text-gray-600">{NO_TRUCK_TYPE_LABEL}</span>
}

function ProgressBar({ s }) {
  const st = LEVEL_STYLES[s.level]
  return (
    <div className="relative h-2 rounded-full bg-gray-800 overflow-hidden">
      <div className={`h-full rounded-full ${st.bar} transition-all duration-500`} style={{ width: `${s.pct}%` }} />
      {s.warn && s.interval > 0 && (
        <span className="absolute top-0 bottom-0 w-px bg-gray-500/70" style={{ left: `${Math.min(100, (s.warn / s.interval) * 100)}%` }} title={`Aviso a las ${fmtMi(s.warn)} mi`} />
      )}
    </div>
  )
}

const INPUT = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500'

/** Detail of one truck: where the miles come from, the settings (admins) and the service history. */
function TruckDetail({ truck, canEdit, startService, onClose, onChanged }) {
  const { session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const s = truck.summary
  const cfg = truck.cfg
  const [editing, setEditing] = useState(!cfg && canEdit)
  const [interval, setInterval_] = useState(cfg ? String(cfg.interval_miles) : '')
  const [warn, setWarn] = useState(cfg?.warn_miles ? String(cfg.warn_miles) : '')
  const [countingFrom, setCountingFrom] = useState(cfg?.counting_from || today())
  const [startMiles, setStartMiles] = useState(cfg ? String(cfg.start_miles || 0) : '0')
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState([])
  const [serviceOpen, setServiceOpen] = useState(!!startService && !!truck.cfg)
  const serviceRef = useRef(null)
  const [serviceDate, setServiceDate] = useState(today())
  const [serviceNotes, setServiceNotes] = useState('')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => { fetchServiceLogs(truck.id).then(setLogs) }, [truck.id, cfg?.counting_from])
  useEffect(() => { if (serviceOpen) serviceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [serviceOpen])

  async function save() {
    const iv = Number(interval)
    const wn = warn ? Number(warn) : null
    if (!(iv > 0)) return toast.warning('Ingresa cada cuántas millas toca el mantenimiento')
    if (wn !== null && (!(wn > 0) || wn >= iv)) return toast.warning('El aviso debe ser menor que el intervalo del mantenimiento')
    setSaving(true)
    try {
      await saveMaintenanceConfig(session, truck, { interval: iv, warn: wn, countingFrom, startMiles })
      toast.success('Mantenimiento configurado')
      setEditing(false)
      onChanged()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setSaving(false)
    }
  }

  async function service() {
    setSaving(true)
    try {
      await registerService(session, truck, { date: serviceDate, notes: serviceNotes })
      toast.success('Mantenimiento registrado: el contador vuelve a cero')
      setServiceOpen(false)
      setServiceNotes('')
      onChanged()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setSaving(false)
    }
  }

  const st = s ? LEVEL_STYLES[s.level] : null

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 animate-modal-backdrop" onClick={onClose}>
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-modal-panel" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white truncate">Truck {truck.number} — {truck.name}</h2>
              <TypeBadge type={truck.truck_type} />
            </div>
            {s && <p className={`text-xs mt-0.5 ${st.text}`}>{alertMessage(s, truck.name)}</p>}
          </div>
          {canEdit && cfg && (
            <button
              onClick={() => setServiceOpen(true)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors"
            >
              Mantenimiento realizado
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {s ? (
            <>
              {/* Counter */}
              <div className="space-y-3">
                <ProgressBar s={s} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Recorridas</p>
                    <p className={`text-base font-bold ${st.text}`}>{fmtMi(s.total)} mi</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Cada</p>
                    <p className="text-base font-bold text-white">{fmtMi(s.interval)} mi</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Aviso a las</p>
                    <p className="text-base font-bold text-white">{s.warn ? `${fmtMi(s.warn)} mi` : '—'}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">{s.remaining >= 0 ? 'Faltan' : 'Pasadas'}</p>
                    <p className={`text-base font-bold ${st.text}`}>{fmtMi(Math.abs(s.remaining))} mi</p>
                  </div>
                </div>
              </div>

              {/* Where the miles come from */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">
                  De dónde salen las millas · órdenes desde {fmtDate(cfg.counting_from)}
                </p>
                <div className="border border-gray-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 bg-gray-900/70">
                          <th className="px-3 py-2">Orden</th>
                          <th className="px-3 py-2">Ruta</th>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2 text-right">Cargadas</th>
                          <th className="px-3 py-2 text-right">DH</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.offset > 0 && (
                          <tr className="border-t border-gray-800 text-gray-400">
                            <td className="px-3 py-2" colSpan={5}>Millas ya recorridas desde el último mantenimiento (al configurar)</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-300">{fmtMi(s.offset)}</td>
                          </tr>
                        )}
                        {s.orders.map(o => (
                          <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="border-t border-gray-800 hover:bg-gray-900/60 cursor-pointer transition-colors">
                            <td className="px-3 py-2 text-gray-200 font-medium">{o.order_number}</td>
                            <td className="px-3 py-2 text-gray-500">{o.pu_city} → {o.do_city}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(o.pu_date)}</td>
                            <td className="px-3 py-2 text-right text-gray-300">{fmtMi(o.miles)}</td>
                            <td className="px-3 py-2 text-right text-gray-300">{fmtMi(o.dead_miles)}</td>
                            <td className="px-3 py-2 text-right text-white font-medium">{fmtMi((Number(o.miles) || 0) + (Number(o.dead_miles) || 0))}</td>
                          </tr>
                        ))}
                        {s.orders.length === 0 && s.offset === 0 && (
                          <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-600">Todavía no hay órdenes en marcha desde esa fecha</td></tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-700 bg-gray-900/70 font-semibold">
                          <td className="px-3 py-2 text-gray-400" colSpan={3}>Total · {s.orders.length} orden{s.orders.length !== 1 ? 'es' : ''}</td>
                          <td className="px-3 py-2 text-right text-gray-200">{fmtMi(s.loaded)}</td>
                          <td className="px-3 py-2 text-right text-gray-200">{fmtMi(s.dh)}</td>
                          <td className={`px-3 py-2 text-right ${st.text}`}>{fmtMi(s.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 mt-1.5">Cuentan las órdenes en tránsito, entregadas, facturadas y pagadas: millas cargadas + DH (deadhead). Las reservadas, asignadas, canceladas y TONU no cuentan.</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 text-center py-6">
              {canEdit ? 'Este camión todavía no tiene el mantenimiento configurado.' : 'El mantenimiento de este camión todavía no está configurado.'}
            </p>
          )}

          {/* Settings (admins) */}
          {canEdit && (
            <div className="border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Configuración</p>
                {cfg && !editing && (
                  <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-orange-300 transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                    Editar
                  </button>
                )}
              </div>
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-xs text-gray-400 mb-1">Mantenimiento cada (millas) *</span>
                      <input type="number" min="1" value={interval} onChange={e => setInterval_(e.target.value)} placeholder="6000" className={INPUT} />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-gray-400 mb-1">Primer aviso a las (millas, opcional)</span>
                      <input type="number" min="1" value={warn} onChange={e => setWarn(e.target.value)} placeholder="5000" className={INPUT} />
                    </label>
                    <div className="block">
                      <span className="block text-xs text-gray-400 mb-1">Contar desde</span>
                      <DatePicker value={countingFrom} onChange={setCountingFrom} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm hover:border-gray-500" />
                    </div>
                    <label className="block">
                      <span className="block text-xs text-gray-400 mb-1">Millas ya recorridas desde el último mantenimiento</span>
                      <input type="number" min="0" value={startMiles} onChange={e => setStartMiles(e.target.value)} className={INPUT} />
                    </label>
                  </div>
                  <p className="text-[10px] text-gray-600">Amarillo al llegar al aviso, rojo al llegar al intervalo. Las alertas le llegan al super admin, a los admins y al chofer de este camión, dentro de la app.</p>
                  <div className="flex justify-end gap-2">
                    {cfg && <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>}
                    <button onClick={save} disabled={saving} className="px-4 py-1.5 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-500 transition-colors disabled:opacity-50">Guardar</button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Cada <span className="text-gray-300 font-medium">{fmtMi(cfg.interval_miles)} mi</span>
                  {cfg.warn_miles ? <> · aviso a las <span className="text-gray-300 font-medium">{fmtMi(cfg.warn_miles)} mi</span></> : ' · sin aviso previo'}
                  {' '}· contando desde {fmtDate(cfg.counting_from)}
                </p>
              )}
            </div>
          )}

          {/* Services */}
          {cfg && (
            <div ref={serviceRef}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Historial de mantenimientos{logs.length > 0 && ` · ${logs.length}`}</p>
                {canEdit && !serviceOpen && (
                  <button onClick={() => setServiceOpen(true)} className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors">+ Mantenimiento realizado</button>
                )}
              </div>
              {serviceOpen && (
                <div className="border border-emerald-700/40 bg-emerald-600/5 rounded-xl p-3 mb-3 space-y-2">
                  <p className="text-xs text-gray-400">Al registrarlo el contador vuelve a cero y empieza a contar desde esa fecha. Queda guardado en el historial.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <DatePicker value={serviceDate} onChange={setServiceDate} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm hover:border-gray-500" />
                    <input value={serviceNotes} onChange={e => setServiceNotes(e.target.value)} placeholder="Notas (aceite, frenos...)" className={INPUT} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setServiceOpen(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
                    <button onClick={service} disabled={saving} className="px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 transition-colors disabled:opacity-50">Registrar</button>
                  </div>
                </div>
              )}
              {logs.length === 0 ? (
                <p className="text-xs text-gray-600">Todavía no se ha registrado ningún mantenimiento de este camión.</p>
              ) : (
                <div className="space-y-1.5">
                  {logs.map(l => (
                    <div key={l.id} className="flex items-center justify-between gap-3 text-xs bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                      <span className="text-gray-200 font-medium shrink-0">{fmtDate(l.serviced_at)}</span>
                      <span className="text-gray-500 truncate flex-1">
                        {l.notes || 'Mantenimiento realizado'}
                        {(l.created_by_name || l.created_by_email) && <span className="text-gray-700"> · {l.created_by_name || l.created_by_email}</span>}
                      </span>
                      {l.miles_at != null && <span className="text-gray-500 shrink-0">a las {fmtMi(l.miles_at)} mi</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Maintenance() {
  const { session } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canEdit = canAccess(session, 'mantenimiento', 'configurar')
  const [data, setData] = useState(null)
  const selectedId = params.get('truck')

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

  const selected = data?.trucks.find(t => t.id === selectedId) || null

  // Looking at a truck's detail counts as reading its alert
  useEffect(() => {
    if (selected?.key && selected.summary.level !== 'ok' && !data.reads.has(selected.key)) {
      markAlertsRead(session, [selected.key]).then(notifyMaintenanceChanged)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.key])

  const order = { critical: 0, warn: 1, ok: 2 }
  const trucks = [...(data?.trucks || [])].sort((a, b) =>
    (a.summary ? order[a.summary.level] : 3) - (b.summary ? order[b.summary.level] : 3))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Mantenimiento</h1>
        <p className="text-sm text-gray-500 mt-0.5">Millas recorridas (cargadas + DH) desde el último mantenimiento de cada camión</p>
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {trucks.length === 0 ? (
            <div className="text-center py-20 text-gray-500 text-sm">
              No hay camiones con tipo elegido.
              <p className="text-xs text-gray-600 mt-1">Elige si es Box Truck, Dry Van o Reefer al crear o editar el camión en el Dashboard.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trucks.map(t => {
                const s = t.summary
                const st = s ? LEVEL_STYLES[s.level] : null
                return (
                  <button
                    key={t.id}
                    onClick={() => setParams({ truck: t.id })}
                    className={`text-left bg-gray-900 border rounded-xl p-4 space-y-3 transition-colors hover:bg-gray-900/80 ${s && s.level !== 'ok' ? st.soft : 'border-gray-800 hover:border-gray-700'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-white text-sm truncate">Truck {t.number} — {t.name}</p>
                        <div className="mt-1"><TypeBadge type={t.truck_type} /></div>
                      </div>
                      {s && <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${st.text}`}>{st.label}</span>}
                    </div>
                    {s ? (
                      <>
                        <ProgressBar s={s} />
                        <div className="flex items-end justify-between gap-2">
                          <p className="text-xs text-gray-500"><span className={`text-base font-bold ${st.text}`}>{fmtMi(s.total)}</span> / {fmtMi(s.interval)} mi</p>
                          <p className={`text-xs ${st.text}`}>{s.remaining >= 0 ? `Faltan ${fmtMi(s.remaining)} mi` : `Pasó ${fmtMi(-s.remaining)} mi`}</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-600">{canEdit ? 'Sin configurar — toca para definir cada cuántas millas' : 'Sin configurar'}</p>
                    )}
                    {canEdit && s && (
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); setParams({ truck: t.id, service: '1' }) }}
                        className="block text-center py-1.5 rounded-lg bg-emerald-600/15 border border-emerald-600/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-600/25 transition-colors"
                      >
                        Mantenimiento realizado
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {data.untyped.length > 0 && (
            <div className="mt-8">
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest mb-2">{NO_TRUCK_TYPE_LABEL} ({data.untyped.length})</p>
              <p className="text-xs text-gray-600 mb-2">Estos camiones no tienen tipo elegido, así que no cuentan millas ni avisos. Elige su tipo en el Dashboard.</p>
              <div className="flex flex-wrap gap-1.5">
                {data.untyped.map(t => (
                  <span key={t.id} className="text-xs px-2.5 py-1 rounded-full bg-gray-900 border border-gray-800 text-gray-500">Truck {t.number} — {t.name}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {selected && (
        <TruckDetail
          key={selected.id}
          truck={selected}
          canEdit={canEdit}
          startService={params.get('service') === '1'}
          onClose={() => setParams({})}
          onChanged={load}
        />
      )}
    </div>
  )
}
