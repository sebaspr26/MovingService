import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { geocode } from '../lib/here'
import { supabase } from '../lib/supabase'
import DateRangePicker from './DateRangePicker'

const US_TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'
const MAP_W = 975
const MAP_H = 610

// Cache geocode results to avoid repeated API calls
const geoCache = {}
async function cachedGeocode(city) {
  if (!city) return null
  const key = city.toLowerCase().trim()
  if (geoCache[key]) return geoCache[key]
  const result = await geocode(city)
  if (result) geoCache[key] = result
  return result
}

export default function StatisticsMap() {
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [topoData, setTopoData] = useState(null)
  const [progress, setProgress] = useState('')
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [driverFilter, setDriverFilter] = useState('')
  const [drivers, setDrivers] = useState([])

  // Load US topology
  useEffect(() => {
    fetch(US_TOPO_URL)
      .then(r => r.json())
      .then(setTopoData)
      .catch(() => setError('Error cargando mapa'))
  }, [])

  // Load drivers for filter dropdown
  useEffect(() => {
    supabase
      .from('drivers')
      .select('id, name')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        if (data) setDrivers(data)
      })
  }, [])

  const search = useCallback(async () => {
    if (!dateFrom && !dateTo && !driverFilter) return
    setLoading(true)
    setError('')
    setConnections([])
    setProgress('Cargando ordenes...')

    let query = supabase
      .from('orders')
      .select('id, order_number, pu_city, do_city, miles, rate, pu_date, driver_name')
      .not('pu_city', 'is', null)
      .not('do_city', 'is', null)
      .order('created_at', { ascending: false })

    if (dateFrom) query = query.gte('pu_date', dateFrom)
    if (dateTo) query = query.lte('pu_date', dateTo)
    if (driverFilter) query = query.eq('driver_name', driverFilter)

    const { data: orders, error: dbErr } = await query

    if (dbErr) {
      setError('Error cargando ordenes')
      setLoading(false)
      return
    }

    const valid = orders.filter(o => o.pu_city?.trim() && o.do_city?.trim())
    if (valid.length === 0) {
      setProgress('')
      setLoading(false)
      return
    }

    // Collect unique cities
    const uniqueCities = [...new Set(valid.flatMap(o => [o.pu_city.trim(), o.do_city.trim()]))]
    setProgress(`Geocodificando ${uniqueCities.length} ciudades...`)

    // Geocode in batches of 5
    const cityCoords = {}
    for (let i = 0; i < uniqueCities.length; i += 5) {
      const batch = uniqueCities.slice(i, i + 5)
      const results = await Promise.all(batch.map(c => cachedGeocode(c)))
      batch.forEach((city, j) => {
        if (results[j]) cityCoords[city.trim()] = results[j]
      })
      setProgress(`Geocodificando ${Math.min(i + 5, uniqueCities.length)}/${uniqueCities.length} ciudades...`)
    }

    const conns = valid
      .map(o => {
        const from = cityCoords[o.pu_city.trim()]
        const to = cityCoords[o.do_city.trim()]
        if (!from || !to) return null
        return {
          id: o.id,
          orderNumber: o.order_number,
          miles: o.miles,
          rate: o.rate,
          from: { name: o.pu_city.trim(), lat: from.lat, lng: from.lng },
          to: { name: o.do_city.trim(), lat: to.lat, lng: to.lng },
        }
      })
      .filter(Boolean)

    setConnections(conns)
    setProgress('')
    setLoading(false)
  }, [dateFrom, dateTo, driverFilter])

  const clearFilters = useCallback(() => {
    setDateFrom('')
    setDateTo('')
    setDriverFilter('')
    setConnections([])
    setError('')
  }, [])

  const hasFilters = dateFrom || dateTo || driverFilter

  const projection = useMemo(() => {
    return geoAlbersUsa().scale(1300).translate([MAP_W / 2, MAP_H / 2])
  }, [])

  const pathGenerator = useMemo(() => geoPath().projection(projection), [projection])

  const states = useMemo(() => {
    if (!topoData) return []
    return feature(topoData, topoData.objects.states).features
  }, [topoData])

  const projectedConnections = useMemo(() => {
    return connections.map(c => {
      const fromPt = projection([c.from.lng, c.from.lat])
      const toPt = projection([c.to.lng, c.to.lat])
      return { ...c, fromPt, toPt }
    }).filter(c => c.fromPt && c.toPt)
  }, [connections, projection])

  const markers = useMemo(() => {
    const seen = new Set()
    const list = []
    connections.forEach(c => {
      const fKey = `${c.from.lat},${c.from.lng}`
      const tKey = `${c.to.lat},${c.to.lng}`
      if (!seen.has(fKey)) {
        seen.add(fKey)
        const pt = projection([c.from.lng, c.from.lat])
        if (pt) list.push({ ...c.from, pt })
      }
      if (!seen.has(tKey)) {
        seen.add(tKey)
        const pt = projection([c.to.lng, c.to.lat])
        if (pt) list.push({ ...c.to, pt })
      }
    })
    return list
  }, [connections, projection])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">Rango de fechas</label>
          <DateRangePicker
            startDate={dateFrom}
            endDate={dateTo}
            onChange={(from, to) => { setDateFrom(from); setDateTo(to) }}
            placeholder="Seleccionar rango..."
          />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs text-gray-500 mb-1">Chofer</label>
          <select
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
          >
            <option value="">Todos</option>
            {drivers.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={search}
          disabled={loading || !hasFilters}
          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-600 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Status */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {progress}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Map */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden relative">
        {!topoData ? (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            Cargando mapa...
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            className="w-full h-auto"
            onMouseLeave={() => setTooltip(null)}
          >
            {/* States */}
            {states.map((geo, i) => (
              <path
                key={i}
                d={pathGenerator(geo)}
                fill="#374151"
                stroke="#9ca3af"
                strokeWidth={0.75}
              />
            ))}

            {/* Lines */}
            {projectedConnections.map(c => (
              <line
                key={c.id}
                x1={c.fromPt[0]}
                y1={c.fromPt[1]}
                x2={c.toPt[0]}
                y2={c.toPt[1]}
                stroke={tooltip?.id === c.id ? '#60a5fa' : '#3b82f6'}
                strokeWidth={tooltip?.id === c.id ? 3 : 2}
                strokeLinecap="round"
                opacity={tooltip && tooltip.id !== c.id ? 0.3 : 0.7}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => {
                  const rect = svgRef.current.getBoundingClientRect()
                  setTooltip({ id: c.id, x: e.clientX - rect.left, y: e.clientY - rect.top, from: c.from.name, to: c.to.name, order: c.orderNumber, miles: c.miles, rate: c.rate })
                }}
                onMouseMove={(e) => {
                  const rect = svgRef.current.getBoundingClientRect()
                  setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null)
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}

            {/* Markers */}
            {markers.map((m, i) => (
              <circle
                key={i}
                cx={m.pt[0]}
                cy={m.pt[1]}
                r={3.5}
                fill="#60a5fa"
                stroke="#1e3a5f"
                strokeWidth={1}
              />
            ))}
          </svg>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs shadow-lg z-10"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10, transform: 'translateY(-100%)' }}
          >
            <p className="text-gray-400 mb-0.5">#{tooltip.order}</p>
            <p className="text-white font-medium">{tooltip.from} <span className="text-blue-400 mx-1">&rarr;</span> {tooltip.to}</p>
            <div className="flex gap-3 mt-1 text-gray-400">
              {tooltip.miles != null && <span>{tooltip.miles.toLocaleString()} mi</span>}
              {tooltip.rate != null && <span className="text-green-400">${tooltip.rate.toLocaleString()}</span>}
            </div>
          </div>
        )}

        {/* Empty state overlay */}
        {!loading && connections.length === 0 && topoData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500 text-sm bg-gray-800/80 px-4 py-2 rounded-lg">Selecciona filtros y presiona Buscar</p>
          </div>
        )}
      </div>

      {/* Connection list */}
      {connections.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Conexiones ({connections.length})</p>
          {connections.map(c => (
            <div
              key={c.id}
              className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            >
              <span className="text-gray-300">
                <span className="text-gray-500 mr-2">#{c.orderNumber}</span>
                {c.from.name} <span className="text-blue-400 mx-1">&rarr;</span> {c.to.name}
              </span>
              <div className="flex gap-3 text-xs">
                {c.miles != null && <span className="text-gray-500">{c.miles.toLocaleString()} mi</span>}
                {c.rate != null && <span className="text-green-400">${c.rate.toLocaleString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
