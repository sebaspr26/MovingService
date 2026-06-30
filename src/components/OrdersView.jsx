import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { STATUS_CONFIG, ALL_STATUSES, fmt, autoAdvanceStatuses } from '../lib/orders'
import OrderDetail from './OrderDetail'
import { useToast } from './Toast'

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
  const [orders, setOrders] = useState([])
  const [trucks, setTrucks] = useState([])
  const [brokers, setBrokers] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [page, setPage] = useState(0)
  const [drawerId, setDrawerId] = useState(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [tonuTarget, setTonuTarget] = useState(null)
  const [tonuPrice, setTonuPrice] = useState('150')
  const toast = useToast()

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setPage(0) }, [tab, search])

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
    const advancedOrders = await autoAdvanceStatuses(ordersRes.data || [], supabase)
    setOrders(advancedOrders)
    setTrucks(trucksRes.data || [])
    const bMap = {}
    ;(brokersRes.data || []).forEach(b => { bMap[b.id] = b })
    setBrokers(bMap)
    setLoading(false)
  }

  async function handleStatusChange(orderId, newStatus) {
    if (newStatus === 'tonu') {
      setTonuTarget(orderId)
      setTonuPrice('150')
      return
    }
    const updates = { status: newStatus }
    if (newStatus === 'invoiced') updates.paid = true
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

  // Counts per status
  const counts = { all: orders.length }
  ALL_STATUSES.forEach(s => { counts[s] = orders.filter(o => o.status === s).length })

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
        <button
          onClick={() => openDrawer('new')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors inline-flex items-center gap-2 w-fit"
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
          <div className={`overflow-hidden transition-all duration-300 ease-out ${showSearch ? 'w-56 sm:w-72 opacity-100' : 'w-0 opacity-0'}`}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar orden, ciudad, truck, broker..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
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
                  <td className="py-2.5 pr-3 font-medium text-white cursor-pointer" onClick={() => openDrawer(row.id)}>
                    {row.order_number}
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                    {truck ? (
                      <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                        {truck.number}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                    <div className="text-gray-300 text-xs">{row.pu_city || '-'}</div>
                    <div className="text-[10px] text-gray-600">{row.pu_date}</div>
                  </td>
                  <td className="py-2.5 pr-3 cursor-pointer" onClick={() => openDrawer(row.id)}>
                    <div className="text-gray-300 text-xs">{row.do_city || '-'}</div>
                    <div className="text-[10px] text-gray-600">{row.do_date}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-400 text-xs cursor-pointer" onClick={() => openDrawer(row.id)}>
                    {Number(row.miles || 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-xs cursor-pointer" onClick={() => openDrawer(row.id)}>
                    {Number(row.dead_miles || 0) > 0 ? (
                      <span className="text-orange-400">{Number(row.dead_miles).toLocaleString()}</span>
                    ) : (
                      <span className="text-gray-700">-</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right cursor-pointer" onClick={() => openDrawer(row.id)}>
                    <span className="text-green-400 font-medium text-xs">{fmt(row.rate || 0)}</span>
                    {Number(row.rate) > 0 && (Number(row.miles || 0) + Number(row.dead_miles || 0)) > 0 && (
                      <div className="text-[10px] text-gray-500">${(Number(row.rate) / (Number(row.miles || 0) + Number(row.dead_miles || 0))).toFixed(2)}/mi</div>
                    )}
                  </td>
                  <td className="py-2.5">
                    <button
                      onClick={() => openDrawer(row.id)}
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
