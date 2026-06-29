import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { STATUS_CONFIG, STATUS_ORDER, ALL_STATUSES, fmt } from '../lib/orders'

const PAGE_SIZE = 10

const TABS = [
  { key: 'all', label: 'Todas' },
  { key: 'booked', label: 'Reservadas' },
  { key: 'assigned', label: 'Asignadas' },
  { key: 'in_transit', label: 'En Transito' },
  { key: 'delivered', label: 'Entregadas' },
  { key: 'invoiced', label: 'Facturadas' },
  { key: 'tonu', label: 'TONU' },
  { key: 'canceled', label: 'Canceladas' },
]

export default function OrdersView() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [trucks, setTrucks] = useState([])
  const [brokers, setBrokers] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [page, setPage] = useState(0)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setPage(0) }, [tab, search])

  async function fetchData() {
    setLoading(true)
    const [ordersRes, trucksRes, brokersRes] = await Promise.all([
      supabase.from('orders').select('*').order('pu_date', { ascending: false }),
      supabase.from('trucks').select('id, name, number'),
      supabase.from('brokers').select('id, name, type'),
    ])
    setOrders(ordersRes.data || [])
    setTrucks(trucksRes.data || [])
    const bMap = {}
    ;(brokersRes.data || []).forEach(b => { bMap[b.id] = b })
    setBrokers(bMap)
    setLoading(false)
  }

  async function handleStatusChange(orderId, newStatus) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    const updates = { status: newStatus }
    if (newStatus === 'invoiced') updates.paid = true
    await supabase.from('orders').update(updates).eq('id', orderId)
  }

  const truckMap = {}
  trucks.forEach(t => { truckMap[t.id] = t })

  // Counts per status
  const counts = { all: orders.length }
  ALL_STATUSES.forEach(s => { counts[s] = orders.filter(o => o.status === s).length })

  // Revenue stats
  const totalRevenue = orders.reduce((s, o) => s + (Number(o.rate) || 0), 0)
  const totalMiles = orders.reduce((s, o) => s + (Number(o.miles) || 0), 0)

  // Filter by tab
  let filtered = tab === 'all' ? orders : orders.filter(o => o.status === tab)

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

  // Revenue per truck for chart
  const truckRevenue = {}
  orders.forEach(o => {
    const t = truckMap[o.truck_id]
    if (!t) return
    const key = t.number
    if (!truckRevenue[key]) truckRevenue[key] = { name: t.name, number: key, revenue: 0, loads: 0, miles: 0 }
    truckRevenue[key].revenue += Number(o.rate) || 0
    truckRevenue[key].loads += 1
    truckRevenue[key].miles += Number(o.miles) || 0
  })
  const chartData = Object.values(truckRevenue).sort((a, b) => b.revenue - a.revenue)
  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-800 rounded w-48 animate-pulse" />
        <div className="h-64 bg-gray-800 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ordenes / Cargas</h1>
          <p className="text-sm text-gray-500 mt-1">{orders.length} ordenes totales</p>
        </div>
        <Link
          to="/orders/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors inline-flex items-center gap-2 w-fit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nueva Orden
        </Link>
      </div>

      {/* Stats + Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status cards */}
        <div className="space-y-2">
          {/* Facturada — full width top */}
          {(() => {
            const cfg = STATUS_CONFIG.invoiced
            const count = counts.invoiced || 0
            const colorMap = { green: 'border-emerald-800/60' }
            return (
              <button
                onClick={() => setTab(tab === 'invoiced' ? 'all' : 'invoiced')}
                className={`w-full bg-gray-900 border rounded-xl p-3 text-left transition-all hover:bg-gray-800/50 flex items-center justify-between ${
                  tab === 'invoiced' ? colorMap[cfg.color] + ' scale-[1.01]' : 'border-gray-800'
                }`}
              >
                <p className="text-[11px] text-gray-500">{cfg.label}</p>
                <p className={`text-xl font-bold ${cfg.text}`}>{count}</p>
              </button>
            )
          })()}

          {/* Other 4 statuses — 2x2 grid */}
          <div className="grid grid-cols-2 gap-2">
            {STATUS_ORDER.filter(s => s !== 'invoiced').map(s => {
              const cfg = STATUS_CONFIG[s]
              const count = counts[s] || 0
              const colorMap = { blue: 'border-blue-800/60', yellow: 'border-yellow-800/60', orange: 'border-orange-800/60', cyan: 'border-cyan-800/60' }
              return (
                <button
                  key={s}
                  onClick={() => setTab(tab === s ? 'all' : s)}
                  className={`bg-gray-900 border rounded-xl p-3 text-left transition-all hover:bg-gray-800/50 ${
                    tab === s ? colorMap[cfg.color] + ' scale-[1.02]' : 'border-gray-800'
                  }`}
                >
                  <p className={`text-xl font-bold ${cfg.text}`}>{count}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{cfg.label}</p>
                </button>
              )
            })}
          </div>

        </div>

        {/* Revenue chart per truck */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue por Truck</h3>
            <div className="flex gap-4 text-xs">
              <span className="text-gray-500">Total: <span className="text-green-400 font-semibold">{fmt(totalRevenue)}</span></span>
              <span className="text-gray-500">{totalMiles.toLocaleString()} mi</span>
            </div>
          </div>
          <div className="space-y-3">
            {chartData.map(d => {
              const pct = (d.revenue / maxRevenue) * 100
              return (
                <div key={d.number} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-medium">{d.number}</span>
                      <span className="text-xs text-gray-500">{d.loads} cargas</span>
                    </div>
                    <span className="text-xs text-green-400 font-semibold">{fmt(d.revenue)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-500 group-hover:brightness-125"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[10px] text-gray-600">{d.miles.toLocaleString()} mi</span>
                    {d.miles > 0 && (
                      <span className="text-[10px] text-blue-400">${(d.revenue / d.miles).toFixed(2)}/mi</span>
                    )}
                  </div>
                </div>
              )
            })}
            {chartData.length === 0 && (
              <p className="text-center text-gray-600 text-xs py-4">Sin datos</p>
            )}
          </div>
        </div>
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
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                tab === t.key ? 'bg-blue-600/30' : 'bg-gray-800'
              }`}>
                {counts[t.key] || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          {showSearch && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar orden, ciudad, truck, broker..."
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500 w-56 sm:w-72"
              autoFocus
            />
          )}
          <button
            onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearch('') }}
            className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'bg-blue-600/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3">Orden #</th>
              <th className="pb-2 pr-3">Truck</th>
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
                booked: 'border-l-blue-500',
                assigned: 'border-l-yellow-500',
                in_transit: 'border-l-orange-500',
                delivered: 'border-l-cyan-500',
                invoiced: 'border-l-emerald-500',
                tonu: 'border-l-red-500',
                canceled: 'border-l-gray-600',
              }[row.status] || 'border-l-gray-700'
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-800/50 border-l-2 ${rowBorder} hover:bg-gray-800/30 transition-colors group`}
                >
                  <td className="py-2.5 pr-3 pl-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={row.status || 'booked'}
                      onChange={(e) => handleStatusChange(row.id, e.target.value)}
                      className={`text-[11px] font-medium px-2 py-1 rounded-lg cursor-pointer focus:outline-none bg-gray-800 border border-gray-700 ${st.text}`}
                    >
                      {ALL_STATUSES.map(s => (
                        <option key={s} value={s} className="bg-gray-800 text-gray-300">{STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-white cursor-pointer" onClick={() => navigate(`/orders/${row.id}`)}>
                    {row.order_number}
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => navigate(`/orders/${row.id}`)}>
                    {truck ? (
                      <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                        {truck.number}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => navigate(`/orders/${row.id}`)}>
                    <div className="text-gray-300 text-xs">{row.pu_city || '-'}</div>
                    <div className="text-[10px] text-gray-600">{row.pu_date}</div>
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => navigate(`/orders/${row.id}`)}>
                    <div className="text-gray-300 text-xs">{row.do_city || '-'}</div>
                    <div className="text-[10px] text-gray-600">{row.do_date}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-400 text-xs cursor-pointer" onClick={() => navigate(`/orders/${row.id}`)}>
                    {Number(row.miles || 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-xs cursor-pointer" onClick={() => navigate(`/orders/${row.id}`)}>
                    {Number(row.dead_miles || 0) > 0 ? (
                      <span className="text-orange-400">{Number(row.dead_miles).toLocaleString()}</span>
                    ) : (
                      <span className="text-gray-700">-</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right cursor-pointer" onClick={() => navigate(`/orders/${row.id}`)}>
                    <span className="text-green-400 font-medium text-xs">{fmt(row.rate || 0)}</span>
                  </td>
                  <td className="py-2.5">
                    <button
                      onClick={() => navigate(`/orders/${row.id}`)}
                      className="text-gray-600 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
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
                <td colSpan={9} className="py-12 text-center text-gray-600">
                  {q ? 'Sin resultados para la busqueda' : 'Sin ordenes'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
    </div>
  )
}
