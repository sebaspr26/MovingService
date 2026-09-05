import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function CityStats() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all') // all, pickup, delivery

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('orders')
        .select('pu_city, do_city')
        .not('status', 'eq', 'canceled')
      setOrders(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const cityData = useMemo(() => {
    const map = {}

    const normalize = (s) => s.replace(/[,.\-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

    for (const o of orders) {
      const pu = o.pu_city?.trim()
      const del = o.do_city?.trim()

      if (pu) {
        const key = normalize(pu)
        if (!map[key]) map[key] = { name: pu.toUpperCase(), pickup: 0, delivery: 0 }
        map[key].pickup++
      }
      if (del) {
        const key = normalize(del)
        if (!map[key]) map[key] = { name: del.toUpperCase(), pickup: 0, delivery: 0 }
        map[key].delivery++
      }
    }

    return Object.values(map)
      .map(c => ({ ...c, total: c.pickup + c.delivery }))
      .sort((a, b) => b.total - a.total)
  }, [orders])

  const filtered = useMemo(() => {
    let list = cityData
    if (tab === 'pickup') list = list.filter(c => c.pickup > 0)
    if (tab === 'delivery') list = list.filter(c => c.delivery > 0)
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(c => c.name.toLowerCase().includes(q))
    }
    return list
  }, [cityData, search, tab])

  const totalPickups = cityData.reduce((s, c) => s + c.pickup, 0)
  const totalDeliveries = cityData.reduce((s, c) => s + c.delivery, 0)

  const tabs = [
    { key: 'all', label: 'Todas' },
    { key: 'pickup', label: 'Recogidas' },
    { key: 'delivery', label: 'Entregas' },
  ]

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Ciudades</p>
          <p className="text-lg font-bold text-white">{cityData.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Recogidas</p>
          <p className="text-lg font-bold text-cyan-400">{totalPickups}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Entregas</p>
          <p className="text-lg font-bold text-orange-400">{totalDeliveries}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
              tab === t.key
                ? 'bg-gray-700 text-white font-medium'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ciudad..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-6 text-gray-500 text-sm">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          {search ? 'Sin resultados' : 'No hay datos'}
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
          {filtered.map((city, i) => (
            <div
              key={city.name}
              className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2.5 hover:bg-gray-750 transition-colors"
            >
              <span className="text-xs text-gray-600 w-5 text-right font-mono">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{city.name}</p>
                <div className="flex gap-3 mt-0.5">
                  <span className="text-xs text-cyan-400">{city.pickup} recogida{city.pickup !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-orange-400">{city.delivery} entrega{city.delivery !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <span className="text-sm font-semibold text-gray-300">{city.total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
