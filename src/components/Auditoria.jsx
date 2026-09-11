import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getActiveCompanyId } from '../lib/company'
import DateRangePicker from './DateRangePicker'
import MultiSelect from './MultiSelect'

const PAGE_SIZE = 50

const ACTIONS = {
  create_truck: { label: 'Camión creado', color: 'emerald', icon: 'M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  update_truck: { label: 'Camión editado', color: 'blue', icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125' },
  delete_truck: { label: 'Camión eliminado', color: 'red', icon: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' },
  open_cycle: { label: 'Ciclo abierto', color: 'cyan', icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99' },
  close_cycle: { label: 'Ciclo cerrado', color: 'violet', icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99' },
  reopen_cycle: { label: 'Ciclo reabierto', color: 'yellow', icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99' },
}

const COLOR_CLASSES = {
  emerald: { bg: 'bg-emerald-600/10', border: 'border-emerald-600/20', text: 'text-emerald-400' },
  blue: { bg: 'bg-blue-600/10', border: 'border-blue-600/20', text: 'text-blue-400' },
  red: { bg: 'bg-red-600/10', border: 'border-red-600/20', text: 'text-red-400' },
  cyan: { bg: 'bg-cyan-600/10', border: 'border-cyan-600/20', text: 'text-cyan-400' },
  violet: { bg: 'bg-violet-600/10', border: 'border-violet-600/20', text: 'text-violet-400' },
  yellow: { bg: 'bg-yellow-600/10', border: 'border-yellow-600/20', text: 'text-yellow-400' },
}

const FIELD_LABELS = {
  name: 'Nombre', number: 'Número', discount_percent: 'Descuento %',
  is_lis: 'LIS (propietario externo)', owner_name: 'Propietario', vin_number: 'VIN', driver: 'Chofer',
}

const fmtMoney = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
const fmtVal = v => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return String(v)
}

function dayLabel(dateObj) {
  const now = new Date()
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfDay(now) - startOfDay(dateObj)) / 86400000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  return dateObj.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
}

function EntryDetails({ row }) {
  const info = row.extra_info || {}

  if (row.action === 'update_truck') {
    const changes = info.changes || {}
    const keys = Object.keys(changes)
    if (keys.length === 0) return <p className="text-xs text-gray-600">Sin cambios en los campos del camión.</p>
    return (
      <div className="space-y-1.5">
        {keys.map(k => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 w-40 shrink-0">{FIELD_LABELS[k] || k}</span>
            <span className="text-gray-400">{fmtVal(changes[k].from)}</span>
            <svg className="w-3 h-3 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0-4 4m4-4H3" />
            </svg>
            <span className="text-white font-medium">{fmtVal(changes[k].to)}</span>
          </div>
        ))}
      </div>
    )
  }

  if (row.action === 'create_truck') {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div><span className="text-gray-500">Número:</span> <span className="text-gray-300">{fmtVal(info.number)}</span></div>
        <div><span className="text-gray-500">Descuento:</span> <span className="text-gray-300">{info.discount_percent != null ? `${info.discount_percent}%` : '—'}</span></div>
        <div><span className="text-gray-500">Chofer:</span> <span className="text-gray-300">{fmtVal(info.driver)}</span></div>
        <div><span className="text-gray-500">LIS:</span> <span className="text-gray-300">{fmtVal(info.is_lis)}</span></div>
        {info.is_lis && <div><span className="text-gray-500">Propietario:</span> <span className="text-gray-300">{fmtVal(info.owner_name)}</span></div>}
        {info.caja_inicial != null && <div><span className="text-gray-500">Caja inicial:</span> <span className="text-gray-300">{fmtMoney(info.caja_inicial)}</span></div>}
      </div>
    )
  }

  if (row.action === 'delete_truck') {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div><span className="text-gray-500">Número:</span> <span className="text-gray-300">{fmtVal(info.truck_number)}</span></div>
        <div><span className="text-gray-500">Descuento:</span> <span className="text-gray-300">{info.truck_discount != null ? `${info.truck_discount}%` : '—'}</span></div>
        {info.is_lis && <div><span className="text-gray-500">Propietario:</span> <span className="text-gray-300">{fmtVal(info.owner_name)}</span></div>}
      </div>
    )
  }

  if (row.action === 'open_cycle') {
    return (
      <div className="flex gap-4 text-xs">
        <div><span className="text-gray-500">Fecha inicio:</span> <span className="text-gray-300">{info.start_date || '—'}</span></div>
        <div><span className="text-gray-500">Saldo anterior:</span> <span className="text-gray-300">{info.previous_balance != null ? fmtMoney(info.previous_balance) : '—'}</span></div>
      </div>
    )
  }

  if (row.action === 'close_cycle') {
    return (
      <div className="flex gap-4 text-xs">
        <div><span className="text-gray-500">Fecha cierre:</span> <span className="text-gray-300">{info.close_date || '—'}</span></div>
        <div><span className="text-gray-500">Cuadre caja:</span> <span className="text-gray-300">{info.cuadre_caja != null ? fmtMoney(info.cuadre_caja) : '—'}</span></div>
      </div>
    )
  }

  return null
}

export default function Auditoria() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(null)

  // Filter option pools (derived from all rows, independent of current filters/pagination)
  const [truckOptions, setTruckOptions] = useState([])
  const [userOptions, setUserOptions] = useState([])

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionFilter, setActionFilter] = useState([])
  const [truckFilter, setTruckFilter] = useState([])
  const [userFilter, setUserFilter] = useState([])

  const hasActiveFilters = dateFrom || dateTo || actionFilter.length > 0 || truckFilter.length > 0 || userFilter.length > 0

  useEffect(() => {
    const cId = getActiveCompanyId()
    let q = supabase.from('audit_log').select('entity_name, user_name, user_email')
    if (cId) q = q.eq('company_id', cId)
    q.then(({ data }) => {
      const rows = data || []
      const trucks = [...new Set(rows.map(r => r.entity_name).filter(Boolean))].sort()
      const users = [...new Set(rows.map(r => r.user_email || r.user_name).filter(Boolean))]
      const userMap = new Map()
      rows.forEach(r => {
        const key = r.user_email || r.user_name
        if (key && !userMap.has(key)) userMap.set(key, r.user_name || r.user_email)
      })
      setTruckOptions(trucks.map(t => ({ value: t, label: t })))
      setUserOptions(users.map(u => ({ value: u, label: userMap.get(u) || u })))
    })
  }, [])

  const buildQuery = useCallback((offset) => {
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
    const cId = getActiveCompanyId()
    if (cId) q = q.eq('company_id', cId)
    if (dateFrom) q = q.gte('created_at', new Date(dateFrom + 'T00:00:00').toISOString())
    if (dateTo) q = q.lte('created_at', new Date(dateTo + 'T23:59:59.999').toISOString())
    if (actionFilter.length > 0) q = q.in('action', actionFilter)
    if (truckFilter.length > 0) q = q.in('entity_name', truckFilter)
    if (userFilter.length > 0) q = q.or(userFilter.map(u => `user_email.eq.${u},user_name.eq.${u}`).join(','))
    return q
  }, [dateFrom, dateTo, actionFilter, truckFilter, userFilter])

  useEffect(() => {
    setLoading(true)
    setPage(0)
    buildQuery(0).then(({ data }) => {
      setRows(data || [])
      setHasMore((data || []).length === PAGE_SIZE)
      setLoading(false)
    })
  }, [buildQuery])

  async function loadMore() {
    setLoadingMore(true)
    const nextPage = page + 1
    const { data } = await buildQuery(nextPage * PAGE_SIZE)
    setRows(prev => [...prev, ...(data || [])])
    setHasMore((data || []).length === PAGE_SIZE)
    setPage(nextPage)
    setLoadingMore(false)
  }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setActionFilter([]); setTruckFilter([]); setUserFilter([])
  }

  // Group by local calendar day
  const groups = []
  let lastKey = null
  rows.forEach(row => {
    const d = new Date(row.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (key !== lastKey) {
      groups.push({ key, date: d, entries: [] })
      lastKey = key
    }
    groups[groups.length - 1].entries.push(row)
  })

  const actionOptions = Object.entries(ACTIONS).map(([value, cfg]) => ({ value, label: cfg.label }))

  return (
    <div className="animate-tab-in">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Auditoría</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historial de cambios en camiones y ciclos del Dashboard</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 mb-5 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[220px]">
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={({ from, to }) => { setDateFrom(from); setDateTo(to) }} placeholder="Rango de fechas" />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-[150px]">
          <MultiSelect options={actionOptions} value={actionFilter} onChange={setActionFilter} placeholder="Acción" />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-[150px]">
          <MultiSelect options={truckOptions} value={truckFilter} onChange={setTruckFilter} placeholder="Camión" />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-[150px]">
          <MultiSelect options={userOptions} value={userFilter} onChange={setUserFilter} placeholder="Usuario" />
        </div>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="ml-auto text-xs text-gray-500 hover:text-orange-400 transition-colors flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 text-gray-800 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-sm text-gray-500">No hay registros de auditoría</p>
          <p className="text-xs text-gray-700 mt-1">
            {hasActiveFilters ? 'Ningún registro coincide con los filtros seleccionados' : 'Aparecerán aquí los cambios en camiones y ciclos'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.key}>
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest mb-2.5">{dayLabel(group.date)}</p>
              <div className="space-y-2">
                {group.entries.map(row => {
                  const cfg = ACTIONS[row.action] || { label: row.action, color: 'blue', icon: 'M12 6.042A8.967 8.967 0 0 0 6 3.75' }
                  const colors = COLOR_CLASSES[cfg.color]
                  const time = new Date(row.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                  const isOpen = expanded === row.id
                  const hasDetails = ['update_truck', 'create_truck', 'delete_truck', 'open_cycle', 'close_cycle'].includes(row.action)
                  const actorLabel = row.user_name || row.user_email || 'Usuario desconocido'

                  return (
                    <div key={row.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
                      <button
                        onClick={() => hasDetails && setExpanded(isOpen ? null : row.id)}
                        className={`w-full text-left p-3.5 sm:p-4 flex items-center gap-3 ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className={`w-9 h-9 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center shrink-0`}>
                          <svg className={`w-4 h-4 ${colors.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${colors.text}`}>{cfg.label}</span>
                            {row.entity_name && <span className="text-sm text-white truncate">{row.entity_name}</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{actorLabel} · {time}</p>
                        </div>
                        {hasDetails && (
                          <svg className={`w-4 h-4 text-gray-600 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        )}
                      </button>
                      {isOpen && hasDetails && (
                        <div className="border-t border-gray-800 px-4 py-3 bg-gray-900/50">
                          <EntryDetails row={row} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-orange-600/50 hover:bg-orange-600/5 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore && <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                Cargar más
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
