import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { calculateTruckRoute } from '../lib/here'

const fmt = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

export default function RateCalculator() {
  const [stats, setStats] = useState(null)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [extraMiles, setExtraMiles] = useState('')

  useEffect(() => {
    async function loadStats() {
      const { data } = await supabase
        .from('orders')
        .select('rate, miles, pu_city, do_city')
        .not('rate', 'is', null)
        .not('miles', 'is', null)
        .gt('rate', 0)
        .gt('miles', 0)

      if (!data || data.length === 0) return

      const rates = data.map(o => o.rate / o.miles)
      const avg = rates.reduce((s, r) => s + r, 0) / rates.length
      const sorted = [...rates].sort((a, b) => a - b)
      const min = sorted[0]
      const max = sorted[sorted.length - 1]
      const median = sorted[Math.floor(sorted.length / 2)]

      setStats({
        totalOrders: data.length,
        avgPerMile: avg,
        medianPerMile: median,
        minPerMile: min,
        maxPerMile: max,
        orders: data,
      })
    }
    loadStats()
  }, [])

  const calculate = useCallback(async () => {
    if (!origin.trim() || !destination.trim() || !stats) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const route = await calculateTruckRoute(origin.trim(), destination.trim())
      if (!route) {
        setError('No se pudo calcular la ruta')
        setLoading(false)
        return
      }

      const extra = parseFloat(extraMiles) || 0
      const miles = route.distanceMiles + extra

      const originLower = origin.trim().toLowerCase()
      const destLower = destination.trim().toLowerCase()
      const similar = stats.orders.filter(o => {
        const pu = (o.pu_city || '').toLowerCase()
        const doo = (o.do_city || '').toLowerCase()
        return (pu.includes(originLower.split(',')[0]) || doo.includes(destLower.split(',')[0]) ||
                originLower.includes(pu.split(',')[0]) || destLower.includes(doo.split(',')[0]))
      })

      const similarRpm = similar.length > 0
        ? similar.reduce((s, o) => s + o.rate / o.miles, 0) / similar.length
        : null

      setResult({
        miles,
        duration: route.durationMinutes,
        suggested: Math.round(miles * stats.avgPerMile),
        suggestedMedian: Math.round(miles * stats.medianPerMile),
        suggestedLow: Math.round(miles * stats.minPerMile),
        suggestedHigh: Math.round(miles * stats.maxPerMile),
        similarCount: similar.length,
        suggestedSimilar: similarRpm ? Math.round(miles * similarRpm) : null,
        similarRpm,
      })
    } catch {
      setError('Error calculando ruta')
    } finally {
      setLoading(false)
    }
  }, [origin, destination, stats, extraMiles])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') calculate()
  }

  return (
    <div className="space-y-4">
      {/* Historical stats */}
      {stats && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Ordenes analizadas</span>
            <span className="text-xs font-semibold text-white">{stats.totalOrders}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Promedio/mi</span>
            <span className="text-xs font-semibold text-green-400">{fmt(stats.avgPerMile)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Mediana/mi</span>
            <span className="text-xs font-semibold text-blue-400">{fmt(stats.medianPerMile)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Rango/mi</span>
            <span className="text-xs font-semibold text-gray-400">{fmt(stats.minPerMile)} — {fmt(stats.maxPerMile)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Minimo empresa</span>
            <span className="text-xs font-semibold text-yellow-400">{fmt(2.00)}/mi</span>
          </div>
        </div>
      )}

      <div className="border-t border-gray-800" />

      {/* Inputs */}
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Origen</label>
          <input
            type="text"
            value={origin}
            onChange={e => setOrigin(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: Dallas, TX"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Destino</label>
          <input
            type="text"
            value={destination}
            onChange={e => setDestination(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: Chicago, IL"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Millas extra <span className="text-gray-600">(opcional)</span></label>
          <input
            type="number"
            value={extraMiles}
            onChange={e => setExtraMiles(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0"
            min="0"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
        </div>
        <button
          onClick={calculate}
          disabled={loading || !origin.trim() || !destination.trim() || !stats}
          className="w-full px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Calculando...' : 'Calcular'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className="border-t border-gray-800" />

          {/* Route info */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Distancia</p>
              <p className="text-lg font-bold text-white">{result.miles.toLocaleString()} mi</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Tiempo</p>
              <p className="text-sm font-medium text-gray-300">
                {Math.floor(result.duration / 60)}h {result.duration % 60}m
              </p>
            </div>
          </div>

          {/* Prices */}
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Precio sugerido</p>

            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-green-400/70">Promedio</p>
                <p className="text-lg font-bold text-green-400">{fmt(result.suggested)}</p>
              </div>
              <span className="text-[10px] text-gray-500">{fmt(stats.avgPerMile)}/mi</span>
            </div>

            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-blue-400/70">Mediana</p>
                <p className="text-lg font-bold text-blue-400">{fmt(result.suggestedMedian)}</p>
              </div>
              <span className="text-[10px] text-gray-500">{fmt(stats.medianPerMile)}/mi</span>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-yellow-400/70">Minimo empresa</p>
                <p className="text-lg font-bold text-yellow-400">{fmt(result.miles * 2)}</p>
              </div>
              <span className="text-[10px] text-gray-500">$2.00/mi</span>
            </div>

            {result.suggestedSimilar && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-purple-400/70">Rutas similares ({result.similarCount})</p>
                  <p className="text-lg font-bold text-purple-400">{fmt(result.suggestedSimilar)}</p>
                </div>
                <span className="text-[10px] text-gray-500">{fmt(result.similarRpm)}/mi</span>
              </div>
            )}

            <div className="text-center text-[10px] text-gray-600 pt-1">
              Rango: {fmt(result.suggestedLow)} — {fmt(result.suggestedHigh)}
            </div>
          </div>
        </div>
      )}

      {!stats && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando historico...
        </div>
      )}
    </div>
  )
}
