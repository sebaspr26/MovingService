import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { STATUS_CONFIG, ALL_STATUSES, fmt, autoAdvanceStatuses } from '../lib/orders'
import OrderDetail from './OrderDetail'
import DateRangePicker from './DateRangePicker'
import MultiSelect from './MultiSelect'
import { useToast } from './Toast'
import { useAuth } from '../context/AuthContext'
import { getAllowedTruckIds, isSuperAdmin, getPerCompanyMeta } from '../lib/permissions'
import { getActiveCompanyId } from '../lib/company'

function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef(null)
  useEffect(() => {
    const from = prevRef.current
    if (from === target) return
    const start = performance.now()
    function tick(now) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else { prevRef.current = target; setValue(target) }
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

// Wraps useCountUp so it can be used inside maps/IIFEs as a component
function AnimatedNum({ value, decimals = 0, prefix = '', fmt: fmtFn = null }) {
  const animated = useCountUp(Number(value) || 0)
  if (fmtFn) return <>{fmtFn(animated)}</>
  if (decimals > 0) return <>{prefix}{animated.toFixed(decimals)}</>
  return <>{prefix}{Math.round(animated).toLocaleString()}</>
}

const PAGE_SIZE = 30

const STATUS_ABBREV = {
  booked: 'R',
  assigned: 'A',
  in_transit: 'ET',
  delivered: 'E',
  invoiced: 'F',
  paid: 'P',
  tonu: 'T',
  canceled: 'C',
}

// Cache orders data per user to avoid cross-user contamination
const ordersCacheMap = {}
const CACHE_TTL = 30000
function getCache(userId) { return ordersCacheMap[userId] || { orders: null, trucks: null, brokers: null, ts: 0 } }
function setCache(userId, data) { ordersCacheMap[userId] = { ...data, ts: Date.now() } }

const TABS = [
  { key: 'all', label: 'Todas' },
  { key: 'booked', label: 'Reservadas' },
  { key: 'assigned', label: 'Asignadas' },
  { key: 'in_transit', label: 'En Transito' },
  { key: 'delivered', label: 'Entregadas' },
  { key: 'invoiced', label: 'Facturadas' },
  { key: 'paid', label: 'Pagadas' },
  { key: 'tonu', label: 'TONU' },
  { key: 'canceled', label: 'Canceladas' },
]

function StatusSelect({ row, onChange }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const btnRef = useRef(null)
  const st = STATUS_CONFIG[row.status] || STATUS_CONFIG.booked

  function handleOpen(e) {
    e.stopPropagation()
    setRect(btnRef.current?.getBoundingClientRect())
    setOpen(true)
  }

  function handleSelect(status) {
    onChange(row.id, status)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        title={st.label}
        className={`text-[11px] font-bold px-2 py-1 rounded-lg ${st.text} bg-gray-800 border border-gray-700 min-w-[28px] text-center cursor-pointer hover:border-gray-500 transition-colors`}
      >
        {STATUS_ABBREV[row.status] || '?'}
      </button>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-1 min-w-[170px]"
            style={{ top: rect.bottom + 4, left: rect.left }}
          >
            {ALL_STATUSES.map(s => {
              const sc = STATUS_CONFIG[s]
              const isActive = s === row.status
              return (
                <button
                  key={s}
                  onClick={() => handleSelect(s)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${isActive ? 'bg-gray-800/60' : 'hover:bg-gray-800'}`}
                >
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sc.text} bg-gray-900 border border-gray-700 min-w-[22px] text-center`}>
                    {STATUS_ABBREV[s]}
                  </span>
                  <span className={`${sc.text} flex-1`}>{sc.label}</span>
                  {isActive && (
                    <svg className="w-3.5 h-3.5 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

export default function OrdersView() {
  const { session } = useAuth()
  const [orders, setOrders] = useState([])
  const [trucks, setTrucks] = useState([])
  const [brokers, setBrokers] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterTrucks, setFilterTrucks] = useState([])
  const [filterDispatchers, setFilterDispatchers] = useState([])
  const [filterBrokers, setFilterBrokers] = useState([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [authDispatchers, setAuthDispatchers] = useState([]) // [{email, name}]
  const [page, setPage] = useState(0)
  const [drawerId, setDrawerId] = useState(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [tonuTarget, setTonuTarget] = useState(null)
  const [tonuPrice, setTonuPrice] = useState('150')
  const toast = useToast()

  useEffect(() => {
    const userId = session?.user?.id
    const cached = getCache(userId)
    if (cached.orders && Date.now() - cached.ts < CACHE_TTL) {
      setOrders(cached.orders)
      setTrucks(cached.trucks || [])
      setBrokers(cached.brokers || {})
      setLoading(false)
      return
    }
    fetchData()
    // Fetch auth users for dispatcher display + migrate legacy names → emails
    fetch('/api/invite-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })
      .then(r => r.json())
      .then(async data => {
        const roles = ['super_admin', 'admin', 'dispatcher']
        const dispatchers = (data.users || [])
          .filter(u => roles.includes(u.user_metadata?.role))
          .map(u => ({ email: u.email, name: u.user_metadata?.name || u.email }))
        setAuthDispatchers(dispatchers)

        // Migrate orders with name-based dispatcher → email
        const nameToEmail = {}
        dispatchers.forEach(d => {
          if (d.name && d.name !== d.email) nameToEmail[d.name.toLowerCase()] = d.email
        })
        const { data: legacyOrders } = await supabase
          .from('orders').select('id, dispatcher').not('dispatcher', 'is', null).neq('dispatcher', '')
        const toMigrate = (legacyOrders || []).filter(o => !o.dispatcher.includes('@') && nameToEmail[o.dispatcher.trim().toLowerCase()])
        for (const order of toMigrate) {
          const email = nameToEmail[order.dispatcher.trim().toLowerCase()]
          await supabase.from('orders').update({ dispatcher: email }).eq('id', order.id)
        }
        if (toMigrate.length > 0) {
          delete ordersCacheMap[session?.user?.id] // invalidar cache para recargar
          fetchData()
        }
      })
      .catch(() => {})
  }, [])
  useEffect(() => { setPage(0) }, [tab, search, filterTrucks, filterDispatchers, filterBrokers, filterDateFrom, filterDateTo])

  const openDrawer = useCallback((id) => {
    setDrawerId(id)
    requestAnimationFrame(() => setDrawerVisible(true))
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false)
    setTimeout(() => setDrawerId(null), 300)
  }, [])

  async function fetchData() {
    setLoading(true)
    const [ordersRes, trucksRes, brokersRes] = await Promise.all([
      (() => { const q = supabase.from('orders').select('*').order('pu_date', { ascending: false }); const cId = getActiveCompanyId(); return cId ? q.eq('company_id', cId) : q })(),
      (() => { const q = supabase.from('trucks').select('id, name, number'); const cId = getActiveCompanyId(); return cId ? q.eq('company_id', cId) : q })(),
      (() => { const q = supabase.from('brokers').select('id, name, type'); const cId = getActiveCompanyId(); return cId ? q.eq('company_id', cId) : q })(),
    ])
    const allowedIds = getAllowedTruckIds(session)
    const userRole = session?.user?.user_metadata?.role
    const userEmail = session?.user?.email
    const userId = session?.user?.id
    const allTrucks = trucksRes.data || []
    const filteredTrucks = allowedIds ? allTrucks.filter(t => allowedIds.includes(t.id)) : allTrucks
    const allOrders = ordersRes.data || []
    let filteredOrders = allowedIds
      ? allOrders.filter(o => !o.truck_id || allowedIds.includes(o.truck_id))
      : allOrders
    // Drivers: solo las órdenes de su camión asignado
    if ((userRole === 'driver' || userRole === 'driver_lease') && userEmail) {
      const { data: driverRecord } = await supabase
        .from('drivers').select('truck_id').eq('email', userEmail).maybeSingle()
      filteredOrders = driverRecord?.truck_id
        ? filteredOrders.filter(o => o.truck_id === driverRecord.truck_id)
        : []
    }
    // Dispatchers: solo sus órdenes a menos que tengan permiso "ver_todas_ordenes"
    if (userRole === 'dispatcher' && userEmail) {
      const canSeeAll = getPerCompanyMeta(session).permissions?.orders?.ver_todas_ordenes === true
      if (!canSeeAll) {
        const userName = (session?.user?.user_metadata?.name || '').trim().toLowerCase()
        filteredOrders = filteredOrders.filter(o => {
          if (!o.dispatcher) return false
          if (o.dispatcher === userEmail) return true
          // también coincide por nombre mientras no se haya migrado
          if (userName && o.dispatcher.trim().toLowerCase() === userName) return true
          return false
        })
      }
    }
    const advancedOrders = await autoAdvanceStatuses(filteredOrders, supabase)
    setOrders(advancedOrders)
    setTrucks(filteredTrucks)
    const bMap = {}
    ;(brokersRes.data || []).forEach(b => { bMap[b.id] = b })
    setBrokers(bMap)
    setCache(userId, { orders: advancedOrders, trucks: filteredTrucks, brokers: bMap })
    setLoading(false)
  }

  async function handleTogglePaid(row) {
    const wasPaid = row.paid
    const newPaid = !wasPaid
    const newStatus = newPaid ? 'paid' : 'invoiced'
    const updates = { paid: newPaid, status: newStatus }
    setOrders(prev => prev.map(o => o.id === row.id ? { ...o, ...updates } : o))
    const { error } = await supabase.from('orders').update(updates).eq('id', row.id)
    if (error) {
      setOrders(prev => prev.map(o => o.id === row.id ? { ...o, paid: wasPaid, status: row.status } : o))
    }
  }

  async function handleStatusChange(orderId, newStatus) {
    if (newStatus === 'tonu') {
      setTonuTarget(orderId)
      setTonuPrice('150')
      return
    }
    const updates = { status: newStatus }
    if (newStatus === 'paid') updates.paid = true
    if (newStatus !== 'paid' && newStatus !== 'tonu') updates.paid = false
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o))
    await supabase.from('orders').update(updates).eq('id', orderId)
  }

  async function applyTonu() {
    if (!tonuTarget) return
    const price = Number(tonuPrice) || 150
    const updates = { status: 'tonu', rate: price, apply_discount: false, paid: true }
    setOrders(prev => prev.map(o => o.id === tonuTarget ? { ...o, ...updates } : o))
    await supabase.from('orders').update(updates).eq('id', tonuTarget)
    toast.success(`TONU aplicado — ${fmt(price)}`)
    setTonuTarget(null)
  }

  const truckMap = {}
  trucks.forEach(t => { truckMap[t.id] = t })

  // Helper: resolve dispatcher display name (email → name, or raw value)
  function dispatcherName(val) {
    if (!val) return ''
    const found = authDispatchers.find(d => d.email === val)
    return found ? found.name : val
  }

  // Build dispatcher options for filter (from authDispatchers + any legacy name-based values)
  const dispatcherEmails = new Set(authDispatchers.map(d => d.email))
  const authNames = new Set(authDispatchers.map(d => d.name.toLowerCase()))
  const legacyDispatchers = [...new Set(
    orders.map(o => o.dispatcher).filter(d => {
      if (!d) return false
      if (dispatcherEmails.has(d)) return false // ya está como auth user (email)
      if (!d.includes('@') && authNames.has(d.toLowerCase())) return false // nombre coincide con auth user
      return true
    })
  )].sort()
  const dispatcherOptions = [
    ...authDispatchers.map(d => ({ value: d.email, label: d.name })),
    ...legacyDispatchers.map(d => ({ value: d, label: d })),
  ]
  const brokerList = Object.values(brokers).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const hasActiveFilters = filterTrucks.length || filterDispatchers.length || filterBrokers.length || filterDateFrom || filterDateTo

  function clearFilters() {
    setFilterTrucks([])
    setFilterDispatchers([])
    setFilterBrokers([])
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  // Counts per status
  const counts = { all: orders.length }
  ALL_STATUSES.forEach(s => { counts[s] = orders.filter(o => o.status === s).length })

  // Filter by tab
  let filtered = tab === 'all' ? orders : orders.filter(o => o.status === tab)

  // Advanced filters
  if (filterTrucks.length) filtered = filtered.filter(o => filterTrucks.includes(o.truck_id))
  if (filterDispatchers.length) filtered = filtered.filter(o => filterDispatchers.includes(o.dispatcher))
  if (filterBrokers.length) filtered = filtered.filter(o => filterBrokers.includes(o.broker_id))
  if (filterDateFrom) filtered = filtered.filter(o => (o.pu_date || '') >= filterDateFrom)
  if (filterDateTo) filtered = filtered.filter(o => (o.pu_date || '') <= filterDateTo)

  // Search
  const q = search.toLowerCase()
  if (q) {
    filtered = filtered.filter(o => {
      const truck = truckMap[o.truck_id]
      return (
        String(o.order_number || '').toLowerCase().includes(q) ||
        (o.pu_city || '').toLowerCase().includes(q) ||
        (o.do_city || '').toLowerCase().includes(q) ||
        (o.ref_number || '').toLowerCase().includes(q) ||
        (truck?.name || '').toLowerCase().includes(q) ||
        (truck?.number || '').toLowerCase().includes(q) ||
        (brokers[o.broker_id]?.name || '').toLowerCase().includes(q)
      )
    })
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-800 rounded w-48 animate-pulse" />
        <div className="h-64 bg-gray-800 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ordenes / Cargas</h1>
          <p className="text-sm text-gray-500 mt-1">{orders.length} ordenes totales</p>
        </div>
        <button
          onClick={() => openDrawer('new')}
          className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors inline-flex items-center gap-2 w-fit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nueva Orden
        </button>
      </div>

      {/* Filtros — búsqueda integrada en la misma fila */}
      <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl px-3 py-2">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Búsqueda */}
          <div className="relative w-[260px]">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar orden, ciudad, broker..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="w-[120px]">
            <MultiSelect value={filterTrucks} onChange={setFilterTrucks} placeholder="Truck" options={trucks.map(t => ({ value: t.id, label: `${t.number} - ${t.name}` }))} />
          </div>
          <div className="w-[120px]">
            <MultiSelect value={filterDispatchers} onChange={setFilterDispatchers} placeholder="Dispatcher" options={dispatcherOptions} />
          </div>
          <div className="w-[120px]">
            <MultiSelect value={filterBrokers} onChange={setFilterBrokers} placeholder="Broker" options={brokerList.map(b => ({ value: b.id, label: b.name }))} />
          </div>
          <div className="w-[180px]">
            <DateRangePicker dateFrom={filterDateFrom} dateTo={filterDateTo} onChange={({ from, to }) => { setFilterDateFrom(from); setFilterDateTo(to) }} />
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-600/10 rounded-lg transition-colors">Limpiar</button>
          )}
        </div>
      </div>

      {/* Layout: tabla + panel lateral derecho de estados */}
      <div className="flex gap-4 items-start min-h-0">
        {/* Tabla principal */}
        <div className="flex-1 min-w-0">
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-30 transition-colors">‹</button>
                <span className="px-2 py-1 text-gray-400">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-30 transition-colors">›</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 font-semibold border-b border-gray-800 uppercase tracking-wide">
                  <th className="pb-2 pr-3">St.</th>
                  <th className="pb-2 pr-3">Orden #</th>
                  <th className="pb-2 pr-3">Truck</th>
                  <th className="pb-2 pr-3">Dispatcher</th>
                  <th className="pb-2 pr-3">Origen</th>
                  <th className="pb-2 pr-3">Destino</th>
                  <th className="pb-2 pr-3 text-right">Miles / DH</th>
                  <th className="pb-2 pr-3 text-right">Rate</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(row => {
                  const st = STATUS_CONFIG[row.status] || STATUS_CONFIG.booked
                  const truck = truckMap[row.truck_id]
                  const rowBorder = {
                    booked: 'border-l-blue-500', assigned: 'border-l-yellow-500', in_transit: 'border-l-orange-500',
                    delivered: 'border-l-cyan-500', invoiced: 'border-l-emerald-500', paid: 'border-l-violet-500',
                    tonu: 'border-l-red-500', canceled: 'border-l-gray-600',
                  }[row.status] || 'border-l-gray-700'
                  const rowBg = {
                    booked: 'bg-blue-600/10', assigned: 'bg-yellow-600/10', in_transit: 'bg-orange-600/10',
                    delivered: 'bg-cyan-600/10', invoiced: 'bg-emerald-600/10', paid: 'bg-violet-600/10',
                    tonu: 'bg-red-600/10', canceled: 'bg-gray-600/5',
                  }[row.status] || ''
                  return (
                    <tr key={row.id} className={`border-b border-gray-800/60 border-l-2 ${rowBorder} ${rowBg} hover:bg-gray-800/30 transition-colors group`}>
                      <td className="py-3.5 pr-3 pl-2" onClick={(e) => e.stopPropagation()}>
                        <StatusSelect row={row} onChange={handleStatusChange} />
                      </td>
                      <td className="py-3.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                        <div className="font-semibold text-white">{row.order_number}</div>
                        {brokers[row.broker_id] && (
                          <div className="text-[10px] text-gray-500 truncate max-w-[140px]">{brokers[row.broker_id].name}</div>
                        )}
                      </td>
                      <td className="py-3.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                        {truck ? <span className="text-sm bg-gray-800 text-gray-200 font-medium px-2 py-0.5 rounded">{truck.number}</span> : '-'}
                      </td>
                      <td className="py-3.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                        {row.dispatcher ? <span className="text-xs text-gray-300 font-medium">{dispatcherName(row.dispatcher)}</span> : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="py-3.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                        <div className="text-gray-200 text-sm font-medium">{row.pu_city || '-'}</div>
                        <div className="text-[10px] text-gray-500">{row.pu_date}</div>
                      </td>
                      <td className="py-3.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                        <div className="text-gray-200 text-sm font-medium">{row.do_city || '-'}</div>
                        <div className="text-[10px] text-gray-500">{row.do_date}</div>
                      </td>
                      <td className="py-3.5 pr-3 text-right cursor-pointer" onClick={() => openDrawer(row.id)}>
                        <div className="text-gray-300 text-sm font-medium">{Number(row.miles || 0).toLocaleString()}</div>
                        {Number(row.dead_miles || 0) > 0 && (
                          <div className="text-[10px] text-orange-400">{Number(row.dead_miles).toLocaleString()} DH</div>
                        )}
                      </td>
                      <td className="py-3.5 pr-3 text-right cursor-pointer" onClick={() => openDrawer(row.id)}>
                        <span className="text-green-400 font-semibold text-sm">{fmt(row.rate || 0)}</span>
                        {Number(row.rate) > 0 && (Number(row.miles || 0) + Number(row.dead_miles || 0)) > 0 && (
                          <div className="text-[10px] text-gray-500">${(Number(row.rate) / (Number(row.miles || 0) + Number(row.dead_miles || 0))).toFixed(2)}/mi</div>
                        )}
                      </td>
                      <td className="py-3.5">
                        <button onClick={() => openDrawer(row.id)} className="text-gray-600 hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={9} className="py-12 text-center text-gray-600">{q ? 'Sin resultados para la busqueda' : 'Sin ordenes'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel lateral derecho — donut + filtros (oculto en móvil) */}
        <div className="hidden lg:flex lg:flex-col w-64 shrink-0 sticky top-4 max-h-[calc(100vh-5rem)] overflow-y-auto">
          <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-3">
            {/* Todas */}
            <button
              onClick={() => setTab('all')}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium mb-2 transition-colors ${tab === 'all' ? 'bg-orange-600/20 text-orange-400' : 'text-gray-400 hover:bg-gray-800/60'}`}
            >
              <span>Todas las ordenes</span>
              <span className="font-bold tabular-nums"><AnimatedNum value={orders.length} /></span>
            </button>

            {/* Donut + status list */}
            <div className="flex items-center gap-2">
              {/* SVG Donut */}
              <div className="relative shrink-0">
                <svg width="92" height="92" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="28" fill="none" stroke="#1f2937" strokeWidth="9" />
                  {(() => {
                    const r2 = 28
                    const circ2 = 2 * Math.PI * r2
                    const DONUT_COLORS = {
                      booked: '#3b82f6', assigned: '#eab308', in_transit: '#f97316',
                      delivered: '#06b6d4', invoiced: '#10b981', paid: '#8b5cf6',
                      tonu: '#ef4444', canceled: '#6b7280',
                    }
                    let cum = 0
                    return ALL_STATUSES.map(s => {
                      const cnt = counts[s] || 0
                      if (!cnt || !orders.length) return null
                      const dashLen = (cnt / orders.length) * circ2
                      const dashOffset = -cum
                      cum += dashLen
                      return (
                        <circle
                          key={s}
                          cx="40" cy="40" r={r2}
                          fill="none"
                          stroke={DONUT_COLORS[s]}
                          strokeWidth="9"
                          strokeDasharray={`${dashLen} ${circ2}`}
                          strokeDashoffset={dashOffset}
                          transform="rotate(-90 40 40)"
                          className="cursor-pointer hover:opacity-70 transition-opacity"
                          onClick={() => setTab(s)}
                        />
                      )
                    })
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-bold text-white tabular-nums"><AnimatedNum value={orders.length} /></span>
                  <span className="text-[9px] text-gray-500 leading-tight">Total</span>
                </div>
              </div>

              {/* Status list */}
              <div className="flex-1 space-y-px min-w-0">
                {ALL_STATUSES.map(s => {
                  const sc = STATUS_CONFIG[s]
                  const count = counts[s] || 0
                  const isActive = tab === s
                  const borderColor = {
                    booked: 'border-blue-500', assigned: 'border-yellow-500', in_transit: 'border-orange-500',
                    delivered: 'border-cyan-500', invoiced: 'border-emerald-500', paid: 'border-violet-500',
                    tonu: 'border-red-500', canceled: 'border-gray-500',
                  }[s]
                  return (
                    <button
                      key={s}
                      onClick={() => setTab(s)}
                      className={`w-full flex items-center gap-1.5 pl-2 pr-1 py-1 rounded text-left transition-colors border-l-2 ${borderColor} ${isActive ? 'bg-gray-800/80' : 'hover:bg-gray-800/40'}`}
                    >
                      <span className={`text-[10px] truncate flex-1 ${isActive ? 'text-white font-semibold' : sc.text}`}>{sc.label}</span>
                      <span className={`text-[10px] font-bold tabular-nums shrink-0 ${count > 0 ? (isActive ? 'text-white' : 'text-gray-400') : 'text-gray-700'}`}>{count > 0 ? <AnimatedNum value={count} /> : '–'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Brokers / Customers treemap */}
          {(() => {
            const brokerCounts = {}
            orders.forEach(o => {
              if (o.broker_id && brokers[o.broker_id]) {
                brokerCounts[o.broker_id] = (brokerCounts[o.broker_id] || 0) + 1
              }
            })
            const sorted = Object.entries(brokerCounts)
              .map(([id, count]) => ({ id, count, name: brokers[id]?.name || '' }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 6)
            if (!sorted.length) return null
            const total = sorted.reduce((s, b) => s + b.count, 0)
            const TILE_COLORS = ['#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa']
            const [first, ...rest] = sorted
            const leftPct = Math.max(42, Math.min(62, Math.round((first.count / total) * 100)))
            return (
              <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-3 mt-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Brokers / Customers</p>
                {/* Treemap tiles */}
                <div className="flex gap-1 h-28 mb-2">
                  <div
                    className="rounded-lg flex items-center justify-center p-1.5 text-center shrink-0"
                    style={{ width: `${leftPct}%`, background: TILE_COLORS[0] }}
                  >
                    <span className="text-white text-[9px] font-bold leading-tight">{first.name.length > 20 ? first.name.slice(0, 18) + '…' : first.name}</span>
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    {rest.slice(0, 4).map((b, i) => (
                      <div
                        key={b.id}
                        className="rounded-lg flex items-center justify-center p-1 flex-1 text-center overflow-hidden"
                        style={{ background: TILE_COLORS[i + 1] }}
                      >
                        <span className="text-white text-[8px] font-semibold leading-tight">{b.name.length > 12 ? b.name.slice(0, 11) + '…' : b.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* List with counts */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  {sorted.map((b, i) => (
                    <div key={b.id} className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: TILE_COLORS[i] || TILE_COLORS[5] }} />
                      <span className="text-[9px] text-gray-500 truncate flex-1">{b.name.length > 9 ? b.name.slice(0, 8) + '…' : b.name}</span>
                      <span className="text-[9px] font-bold text-gray-300 tabular-nums shrink-0">{b.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Totals — integrado al final del panel */}
          {filtered.length > 0 && (
            <div className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-3 mt-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Resumen</p>
              {(() => {
                const tMiles = Math.round(filtered.reduce((s, r) => s + (Number(r.miles) || 0), 0))
                const tDH = Math.round(filtered.reduce((s, r) => s + (Number(r.dead_miles) || 0), 0))
                const tRate = filtered.reduce((s, r) => s + (Number(r.rate) || 0), 0)
                const tMi = tMiles + tDH
                const rpm = tMi > 0 ? (tRate / tMi) : 0
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">Miles</span>
                      <span className="text-[11px] font-bold text-gray-200 tabular-nums"><AnimatedNum value={tMiles} /></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">DH</span>
                      <span className="text-[11px] font-bold text-orange-400 tabular-nums"><AnimatedNum value={tDH} /></span>
                    </div>
                    <div className="h-px bg-gray-800" />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">Revenue</span>
                      <span className="text-[12px] font-bold text-green-400 tabular-nums"><AnimatedNum value={tRate} fmt={fmt} /></span>
                    </div>
                    {rpm > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">RPM</span>
                        <span className="text-[11px] font-bold text-cyan-400 tabular-nums"><AnimatedNum value={rpm} decimals={2} prefix="$" /></span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Order Detail Drawer */}
      {drawerId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${drawerVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeDrawer}
          />
          {/* Panel */}
          <div
            className={`relative w-full max-w-4xl bg-gray-950 border-l border-gray-800 shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-out ${
              drawerVisible ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="p-4 sm:p-6">
              <OrderDetail
                key={drawerId}
                orderId={drawerId}
                onClose={closeDrawer}
                onSaved={() => { fetchData(); closeDrawer() }}
              />
            </div>
          </div>
        </div>
      )}

      {/* TONU price modal */}
      {tonuTarget && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <h3 className="text-sm font-semibold text-white">TONU — Truck Order Not Used</h3>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cargo TONU (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={tonuPrice}
                  onChange={e => setTonuPrice(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2.5 text-gray-100 text-lg font-semibold focus:outline-none focus:border-red-500"
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Por defecto $150.00 — modifica si es diferente</p>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setTonuTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={applyTonu} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-500 transition-colors">Aplicar TONU</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
