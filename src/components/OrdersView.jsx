import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { STATUS_CONFIG, ALL_STATUSES, fmt, autoAdvanceStatuses } from '../lib/orders'
import OrderDetail from './OrderDetail'
import DateRangePicker from './DateRangePicker'
import MultiSelect from './MultiSelect'
import { useToast } from './Toast'
import { useAuth } from '../context/AuthContext'
import { getAllowedTruckIds, isSuperAdmin } from '../lib/permissions'

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
      supabase.from('orders').select('*').order('pu_date', { ascending: false }),
      supabase.from('trucks').select('id, name, number'),
      supabase.from('brokers').select('id, name, type'),
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
    // Dispatchers: solo sus órdenes a menos que tengan permiso "ver_todas_ordenes"
    if (userRole === 'dispatcher' && userEmail) {
      const canSeeAll = session?.user?.user_metadata?.permissions?.orders?.ver_todas_ordenes === true
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

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'bg-orange-600/20 text-orange-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                tab === t.key ? 'bg-orange-600/30' : 'bg-gray-800'
              }`}>
                {counts[t.key] || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <div className={`overflow-hidden transition-all duration-300 ease-out ${showSearch ? 'w-56 sm:w-72 opacity-100' : 'w-0 opacity-0'}`}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar orden, ciudad, truck, broker..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-orange-500"
              autoFocus
            />
          </div>
          <button
            onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearch('') }}
            className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'bg-orange-600/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg transition-colors relative ${showFilters || hasActiveFilters ? 'bg-orange-600/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'}`}
            title="Filtros avanzados"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
            </svg>
            {hasActiveFilters && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      <div className={`transition-all duration-300 ease-out ${showFilters ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none h-0'}`}>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[140px]">
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Truck</label>
              <MultiSelect
                value={filterTrucks}
                onChange={setFilterTrucks}
                placeholder="Todos"
                options={trucks.map(t => ({ value: t.id, label: `${t.number} - ${t.name}` }))}
              />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Dispatcher</label>
              <MultiSelect
                value={filterDispatchers}
                onChange={setFilterDispatchers}
                placeholder="Todos"
                options={dispatcherOptions}
              />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Broker</label>
              <MultiSelect
                value={filterBrokers}
                onChange={setFilterBrokers}
                placeholder="Todos"
                options={brokerList.map(b => ({ value: b.id, label: b.name }))}
              />
            </div>
            <div className="min-w-[200px]">
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Rango de fechas</label>
              <DateRangePicker
                dateFrom={filterDateFrom}
                dateTo={filterDateTo}
                onChange={({ from, to }) => { setFilterDateFrom(from); setFilterDateTo(to) }}
              />
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-600/10 rounded-lg transition-colors">
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pagination (top) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-30 transition-colors"
            >
              Anterior
            </button>
            <span className="px-3 py-1 text-gray-400">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-30 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Table */}
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
              <th className="pb-2 pr-3 text-right">Miles</th>
              <th className="pb-2 pr-3 text-right">DH</th>
              <th className="pb-2 pr-3 text-right">Rate</th>
              <th className="pb-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(row => {
              const st = STATUS_CONFIG[row.status] || STATUS_CONFIG.booked
              const truck = truckMap[row.truck_id]
              const rowBorder = {
                booked: 'border-l-orange-500',
                assigned: 'border-l-yellow-500',
                in_transit: 'border-l-orange-500',
                delivered: 'border-l-cyan-500',
                invoiced: 'border-l-emerald-500',
                paid: 'border-l-violet-500',
                tonu: 'border-l-red-500',
                canceled: 'border-l-gray-600',
              }[row.status] || 'border-l-gray-700'
              const rowBg = {
                booked: 'bg-orange-600/25',
                assigned: 'bg-yellow-600/25',
                in_transit: 'bg-orange-600/25',
                delivered: 'bg-cyan-600/25',
                invoiced: 'bg-emerald-600/25',
                paid: 'bg-violet-600/25',
                tonu: 'bg-red-600/25',
                canceled: 'bg-gray-600/15',
              }[row.status] || ''
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-800/50 border-l-2 ${rowBorder} ${rowBg} hover:bg-gray-800/30 transition-colors group`}
                >
                  <td className="py-2.5 pr-3 pl-2" onClick={(e) => e.stopPropagation()}>
                    <div className="relative inline-flex items-center" title={st.label}>
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-lg select-none ${st.text} bg-gray-800 border border-gray-700 min-w-[28px] text-center`}>
                        {STATUS_ABBREV[row.status] || '?'}
                      </span>
                      <select
                        value={row.status || 'booked'}
                        onChange={(e) => handleStatusChange(row.id, e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full"
                      >
                        {ALL_STATUSES.map(s => (
                          <option key={s} value={s} className="bg-gray-800 text-gray-300">{STATUS_CONFIG[s].label}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                    <div className="font-semibold text-white">{row.order_number}</div>
                    {brokers[row.broker_id] && (
                      <div className="text-[10px] text-gray-500 truncate max-w-[140px]">{brokers[row.broker_id].name}</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                    {truck ? (
                      <span className="text-sm bg-gray-800 text-gray-200 font-medium px-2 py-0.5 rounded">
                        {truck.number}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                    {row.dispatcher ? (
                      <span className="text-xs text-gray-300 font-medium">{dispatcherName(row.dispatcher)}</span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                    <div className="text-gray-200 text-sm font-medium">{row.pu_city || '-'}</div>
                    <div className="text-[10px] text-gray-500">{row.pu_date}</div>
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                    <div className="text-gray-200 text-sm font-medium">{row.do_city || '-'}</div>
                    <div className="text-[10px] text-gray-500">{row.do_date}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-300 text-sm font-medium cursor-pointer" onClick={() => openDrawer(row.id)}>
                    {Number(row.miles || 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-sm cursor-pointer" onClick={() => openDrawer(row.id)}>
                    {Number(row.dead_miles || 0) > 0 ? (
                      <span className="text-orange-400 font-medium">{Number(row.dead_miles).toLocaleString()}</span>
                    ) : (
                      <span className="text-gray-700">-</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right cursor-pointer" onClick={() => openDrawer(row.id)}>
                    <span className="text-green-400 font-semibold text-sm">{fmt(row.rate || 0)}</span>
                    {Number(row.rate) > 0 && (Number(row.miles || 0) + Number(row.dead_miles || 0)) > 0 && (
                      <div className="text-[10px] text-gray-500">${(Number(row.rate) / (Number(row.miles || 0) + Number(row.dead_miles || 0))).toFixed(2)}/mi</div>
                    )}
                  </td>
                  <td className="py-2.5">
                    <button
                      onClick={() => openDrawer(row.id)}
                      className="text-gray-600 hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="py-12 text-center text-gray-600">
                  {q ? 'Sin resultados para la busqueda' : 'Sin ordenes'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Floating totals bar */}
      {filtered.length > 0 && !drawerId && (
        <div className="fixed bottom-4 right-4 sm:right-6 z-40 bg-gray-950/90 backdrop-blur-sm border border-gray-700 rounded-xl px-4 py-2.5 flex items-center gap-4 text-xs shadow-lg">
          <span className="text-gray-400"><span className="text-gray-600 mr-1">Miles</span> {Math.round(filtered.reduce((s, r) => s + (Number(r.miles) || 0), 0)).toLocaleString()}</span>
          <span className="text-orange-400"><span className="text-gray-600 mr-1">DH</span> {Math.round(filtered.reduce((s, r) => s + (Number(r.dead_miles) || 0), 0)).toLocaleString()}</span>
          <span className="text-green-400 font-bold text-sm">{fmt(filtered.reduce((s, r) => s + (Number(r.rate) || 0), 0))}</span>
          {(() => { const tMi = filtered.reduce((s, r) => s + (Number(r.miles) || 0) + (Number(r.dead_miles) || 0), 0); const tRate = filtered.reduce((s, r) => s + (Number(r.rate) || 0), 0); return tMi > 0 ? <span className="text-cyan-400"><span className="text-gray-600 mr-1">RPM</span> ${(tRate / tMi).toFixed(2)}</span> : null })()}
        </div>
      )}

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
