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

// Map state FIPS to name for matching
const STATE_ABBR_TO_NAME = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
}

export default function StatisticsMap() {
  const [mode, setMode] = useState('heatmap') // heatmap | full
  const [topoData, setTopoData] = useState(null)
  const [error, setError] = useState('')
  const svgRef = useRef(null)

  // Heatmap state
  const [stateCount, setStateCount] = useState({})
  const [heatLoading, setHeatLoading] = useState(true)
  const [heatPoints, setHeatPoints] = useState([])
  const [heatTooltip, setHeatTooltip] = useState(null)

  // Full map state
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [tooltip, setTooltip] = useState(null)
  const [selectedLine, setSelectedLine] = useState(null)
  const [showPoints, setShowPoints] = useState(false)
  const [points, setPoints] = useState([])
  const [pointsLoading, setPointsLoading] = useState(false)
  const [pointTooltip, setPointTooltip] = useState(null)

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

  // Load heatmap data on mount
  useEffect(() => {
    async function loadHeatmap() {
      const { data } = await supabase
        .from('orders')
        .select('pu_city, do_city')
        .not('status', 'eq', 'canceled')

      if (!data) { setHeatLoading(false); return }

      // Extract state abbreviations from city strings like "MIAMI, FL"
      const counts = {}
      const cityCount = {}
      for (const o of data) {
        for (const city of [o.pu_city?.trim(), o.do_city?.trim()]) {
          if (!city) continue
          cityCount[city] = (cityCount[city] || 0) + 1
          const parts = city.split(/[,\s]+/)
          const abbr = parts[parts.length - 1]?.toUpperCase()
          if (abbr && STATE_ABBR_TO_NAME[abbr]) {
            const name = STATE_ABBR_TO_NAME[abbr]
            counts[name] = (counts[name] || 0) + 1
          }
        }
      }
      setStateCount(counts)

      // Also geocode cities for point dots
      const cities = Object.keys(cityCount)
      const coords = {}
      for (let i = 0; i < cities.length; i += 5) {
        const batch = cities.slice(i, i + 5)
        const results = await Promise.all(batch.map(c => cachedGeocode(c)))
        batch.forEach((city, j) => { if (results[j]) coords[city] = results[j] })
      }

      setHeatPoints(
        Object.entries(cityCount)
          .filter(([city]) => coords[city])
          .map(([city, count]) => ({
            name: city,
            count,
            lat: coords[city].lat,
            lng: coords[city].lng,
          }))
      )
      setHeatLoading(false)
    }
    loadHeatmap()
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

  // Full map search
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

    const uniqueCities = [...new Set(valid.flatMap(o => [o.pu_city.trim(), o.do_city.trim()]))]
    setProgress(`Geocodificando ${uniqueCities.length} ciudades...`)

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

  const togglePoints = useCallback(async () => {
    if (showPoints) {
      setShowPoints(false)
      setPoints([])
      setPointTooltip(null)
      return
    }
    setPointsLoading(true)
    setShowPoints(true)
    setPoints(heatPoints)
    setPointsLoading(false)
  }, [showPoints, heatPoints])

  const hasFilters = dateFrom || dateTo || driverFilter

  const projection = useMemo(() => {
    return geoAlbersUsa().scale(1300).translate([MAP_W / 2, MAP_H / 2])
  }, [])

  const pathGenerator = useMemo(() => geoPath().projection(projection), [projection])

  const states = useMemo(() => {
    if (!topoData) return []
    return feature(topoData, topoData.objects.states).features
  }, [topoData])

  // State name by FIPS id from topojson
  const stateNames = useMemo(() => {
    if (!topoData) return {}
    const names = {}
    const geoms = topoData.objects.states.geometries
    for (const g of geoms) {
      if (g.properties?.name) names[g.id] = g.properties.name
    }
    return names
  }, [topoData])

  const maxStateCount = useMemo(() => Math.max(...Object.values(stateCount), 1), [stateCount])

  const getStateColor = useCallback((name) => {
    const count = stateCount[name]
    if (!count) return '#374151' // default gray
    const t = count / maxStateCount
    if (t > 0.7) return '#dc2626'  // red
    if (t > 0.4) return '#ea580c'  // orange
    if (t > 0.2) return '#d97706'  // amber
    if (t > 0.05) return '#0891b2' // cyan
    return '#155e75'               // dark cyan
  }, [stateCount, maxStateCount])

  // Heatmap: compute bounding box of active states to crop/zoom
  const heatmapViewBox = useMemo(() => {
    if (!states.length || !Object.keys(stateCount).length) return `0 0 ${MAP_W} ${MAP_H}`

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let hasActive = false

    for (const geo of states) {
      const name = stateNames[geo.id] || geo.properties?.name
      if (!name || !stateCount[name]) continue
      hasActive = true
      const bounds = pathGenerator.bounds(geo)
      if (bounds[0][0] < minX) minX = bounds[0][0]
      if (bounds[0][1] < minY) minY = bounds[0][1]
      if (bounds[1][0] > maxX) maxX = bounds[1][0]
      if (bounds[1][1] > maxY) maxY = bounds[1][1]
    }

    if (!hasActive) return `0 0 ${MAP_W} ${MAP_H}`

    // Add padding
    const pad = -10
    const shift = -5
    minX = Math.max(0, minX - pad + shift)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(MAP_W, maxX + pad + shift)
    maxY = Math.min(MAP_H, maxY + pad)

    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
  }, [states, stateCount, stateNames, pathGenerator])

  // Heatmap projected points
  const projectedHeatPoints = useMemo(() => {
    return heatPoints.map(p => {
      const pt = projection([p.lng, p.lat])
      return pt ? { ...p, pt } : null
    }).filter(Boolean)
  }, [heatPoints, projection])

  // Full map projections
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

  const projectedPoints = useMemo(() => {
    return points.map(p => {
      const pt = projection([p.lng, p.lat])
      return pt ? { ...p, pt } : null
    }).filter(Boolean)
  }, [points, projection])

  // Handlers
  const handleLineTap = useCallback((c, e) => {
    e.stopPropagation()
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top
    setSelectedLine(prev => prev?.id === c.id ? null : {
      id: c.id, x, y, from: c.from.name, to: c.to.name, order: c.orderNumber, miles: c.miles, rate: c.rate
    })
    setPointTooltip(null)
  }, [])

  const handlePointTap = useCallback((p, e) => {
    e.stopPropagation()
    setPointTooltip(prev => prev?.name === p.name ? null : p)
    setSelectedLine(null)
  }, [])

  const handleHeatPointTap = useCallback((p, e) => {
    e.stopPropagation()
    setHeatTooltip(prev => prev?.name === p.name ? null : p)
  }, [])

  const handleMapBgClick = useCallback(() => {
    setSelectedLine(null)
    setPointTooltip(null)
    setHeatTooltip(null)
  }, [])

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <div className="flex bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setMode('heatmap')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'heatmap'
                ? 'bg-orange-600 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Zona Caliente
          </button>
          <button
            onClick={() => setMode('full')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'full'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Mapa Completo
          </button>
        </div>

        {mode === 'heatmap' && heatLoading && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando zonas...
          </div>
        )}
      </div>

      {/* Full map filters */}
      {mode === 'full' && (
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
          <button
            onClick={togglePoints}
            disabled={pointsLoading}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showPoints
                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                : 'text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600'
            } disabled:opacity-50`}
          >
            {pointsLoading ? 'Cargando...' : showPoints ? 'Ocultar Puntos' : 'Mostrar Puntos'}
          </button>
        </div>
      )}

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
            viewBox={mode === 'heatmap' ? heatmapViewBox : `0 0 ${MAP_W} ${MAP_H}`}
            className="w-full h-auto"
            onMouseLeave={() => { setTooltip(null); setHeatTooltip(null) }}
            onClick={handleMapBgClick}
            onTouchStart={handleMapBgClick}
          >
            {/* States */}
            {states.map((geo, i) => {
              const name = stateNames[geo.id] || geo.properties?.name
              const count = name ? stateCount[name] : 0
              return (
                <path
                  key={i}
                  d={pathGenerator(geo)}
                  fill={mode === 'heatmap' ? getStateColor(name) : '#374151'}
                  stroke={mode === 'heatmap' ? '#1f2937' : '#9ca3af'}
                  strokeWidth={0.75}
                  style={mode === 'heatmap' ? { transition: 'fill 0.3s' } : undefined}
                />
              )
            })}

            {/* === HEATMAP MODE: small dots on cities === */}
            {mode === 'heatmap' && projectedHeatPoints.map((p, i) => {
              const isActive = heatTooltip?.name === p.name
              return (
                <circle
                  key={`hp-${i}`}
                  cx={p.pt[0]}
                  cy={p.pt[1]}
                  r={isActive ? 4.5 : 3}
                  fill={isActive ? '#fff' : '#f1f5f9'}
                  stroke="#0f172a"
                  strokeWidth={0.5}
                  opacity={isActive ? 1 : 0.9}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHeatTooltip(p)}
                  onMouseLeave={() => setHeatTooltip(null)}
                  onClick={(e) => handleHeatPointTap(p, e)}
                  onTouchEnd={(e) => { e.preventDefault(); handleHeatPointTap(p, e) }}
                />
              )
            })}

            {/* === FULL MAP MODE === */}
            {mode === 'full' && (
              <>
                {/* Lines */}
                {projectedConnections.map(c => {
                  const active = tooltip?.id === c.id || selectedLine?.id === c.id
                  return (
                    <line
                      key={c.id}
                      x1={c.fromPt[0]}
                      y1={c.fromPt[1]}
                      x2={c.toPt[0]}
                      y2={c.toPt[1]}
                      stroke={active ? '#60a5fa' : '#3b82f6'}
                      strokeWidth={active ? 3 : 2}
                      strokeLinecap="round"
                      opacity={(tooltip || selectedLine) && !active ? 0.3 : 0.7}
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
                      onClick={(e) => handleLineTap(c, e)}
                      onTouchEnd={(e) => { e.preventDefault(); handleLineTap(c, e) }}
                    />
                  )
                })}

                {/* Connection markers */}
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

                {/* City points */}
                {showPoints && projectedPoints.map((p, i) => {
                  const isActive = pointTooltip?.name === p.name
                  const r = Math.min(3 + p.count * 0.5, 8)
                  return (
                    <circle
                      key={`pt-${i}`}
                      cx={p.pt[0]}
                      cy={p.pt[1]}
                      r={r}
                      fill={isActive ? '#22d3ee' : '#06b6d4'}
                      stroke="#164e63"
                      strokeWidth={1}
                      opacity={isActive ? 1 : 0.8}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setPointTooltip(p)}
                      onMouseLeave={() => setPointTooltip(null)}
                      onClick={(e) => handlePointTap(p, e)}
                      onTouchEnd={(e) => { e.preventDefault(); handlePointTap(p, e) }}
                    />
                  )
                })}
              </>
            )}
          </svg>
        )}

        {/* Heatmap tooltip */}
        {mode === 'heatmap' && heatTooltip && (
          <div
            className="absolute pointer-events-none bg-gray-900/95 border border-gray-600 rounded px-2 py-1.5 text-[10px] shadow-lg z-10"
            style={{
              left: `calc(${(projection([heatTooltip.lng, heatTooltip.lat])?.[0] / MAP_W) * 100}% + 12px)`,
              top: `calc(${(projection([heatTooltip.lng, heatTooltip.lat])?.[1] / MAP_H) * 100}% - 8px)`,
              transform: 'translateY(-100%)',
            }}
          >
            <p className="text-white font-medium">{heatTooltip.name}</p>
            <p className="text-orange-400">{heatTooltip.count} orden{heatTooltip.count !== 1 ? 'es' : ''}</p>
          </div>
        )}

        {/* Full map hover tooltip (PC) */}
        {mode === 'full' && tooltip && (
          <div
            className="absolute pointer-events-none bg-gray-900/95 border border-gray-600 rounded px-2 py-1.5 text-[10px] shadow-lg z-10"
            style={{ left: tooltip.x + 10, top: tooltip.y - 8, transform: 'translateY(-100%)' }}
          >
            <p className="text-white font-medium">{tooltip.from} <span className="text-blue-400 mx-0.5">&rarr;</span> {tooltip.to}</p>
            <div className="flex gap-2 text-gray-400">
              <span>#{tooltip.order}</span>
              {tooltip.miles != null && <span>{tooltip.miles.toLocaleString()} mi</span>}
              {tooltip.rate != null && <span className="text-green-400">${tooltip.rate.toLocaleString()}</span>}
            </div>
          </div>
        )}

        {/* Tap tooltip (mobile) for lines */}
        {mode === 'full' && selectedLine && !tooltip && (
          <div
            className="absolute bg-gray-900/95 border border-gray-600 rounded px-2 py-1.5 text-[10px] shadow-lg z-10"
            style={{ left: Math.min(selectedLine.x + 10, MAP_W * 0.7), top: Math.max(selectedLine.y - 8, 10), transform: 'translateY(-100%)' }}
          >
            <p className="text-white font-medium">{selectedLine.from} <span className="text-blue-400 mx-0.5">&rarr;</span> {selectedLine.to}</p>
            <div className="flex gap-2 text-gray-400">
              <span>#{selectedLine.order}</span>
              {selectedLine.miles != null && <span>{selectedLine.miles.toLocaleString()} mi</span>}
              {selectedLine.rate != null && <span className="text-green-400">${selectedLine.rate.toLocaleString()}</span>}
            </div>
          </div>
        )}

        {/* Point tooltip */}
        {mode === 'full' && pointTooltip && (
          <div
            className="absolute pointer-events-none bg-gray-900/95 border border-cyan-700 rounded px-2 py-1.5 text-[10px] shadow-lg z-10"
            style={{
              left: `calc(${(projection([pointTooltip.lng, pointTooltip.lat])?.[0] / MAP_W) * 100}% + 10px)`,
              top: `calc(${(projection([pointTooltip.lng, pointTooltip.lat])?.[1] / MAP_H) * 100}% - 8px)`,
              transform: 'translateY(-100%)',
            }}
          >
            <p className="text-white font-medium">{pointTooltip.name}</p>
            <p className="text-cyan-400">{pointTooltip.count} orden{pointTooltip.count !== 1 ? 'es' : ''}</p>
          </div>
        )}

        {/* Empty state overlay - only in full mode with no data */}
        {mode === 'full' && !loading && connections.length === 0 && !showPoints && topoData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-500 text-sm bg-gray-800/80 px-4 py-2 rounded-lg">Selecciona filtros y presiona Buscar</p>
          </div>
        )}
      </div>

      {/* Heatmap legend */}
      {mode === 'heatmap' && !heatLoading && Object.keys(stateCount).length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-[10px] text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#155e75' }} />
              Baja
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#0891b2' }} />
              Media
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#d97706' }} />
              Alta
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ea580c' }} />
              Muy alta
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#dc2626' }} />
              Maxima
            </div>
          </div>
          <span className="text-[10px] text-gray-600">{Object.keys(stateCount).length} estados</span>
        </div>
      )}

      {/* Connection list (full mode only) */}
      {mode === 'full' && connections.length > 0 && (
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
