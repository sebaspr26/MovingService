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

  // Load historical rate stats on mount
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

      const miles = route.distanceMiles

      // Find similar routes (same origin or destination city, case insensitive)
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
  }, [origin, destination, stats])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') calculate()
  }

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <p className="text-xs text-gray-500">Ordenes analizadas</p>
            <p className="text-lg font-bold text-white">{stats.totalOrders}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <p className="text-xs text-gray-500">Promedio/mi</p>
            <p className="text-lg font-bold text-green-400">{fmt(stats.avgPerMile)}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <p className="text-xs text-gray-500">Mediana/mi</p>
            <p className="text-lg font-bold text-blue-400">{fmt(stats.medianPerMile)}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <p className="text-xs text-gray-500">Rango/mi</p>
            <p className="text-lg font-bold text-gray-300">{fmt(stats.minPerMile)} - {fmt(stats.maxPerMile)}</p>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 mb-1">Origen</label>
          <input
            type="text"
            value={origin}
            onChange={e => setOrigin(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: Dallas, TX"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 mb-1">Destino</label>
          <input
            type="text"
            value={destination}
            onChange={e => setDestination(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: Chicago, IL"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={calculate}
          disabled={loading || !origin.trim() || !destination.trim() || !stats}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Calculando...' : 'Calcular'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-500">Distancia (truck route)</p>
                <p className="text-xl font-bold text-white">{result.miles.toLocaleString()} mi</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Tiempo estimado</p>
                <p className="text-sm text-gray-300">
                  {Math.floor(result.duration / 60)}h {result.duration % 60}min
                </p>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium">Precio sugerido</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-3">
                  <p className="text-xs text-green-400">Promedio historico</p>
                  <p className="text-xl font-bold text-green-400">{fmt(result.suggested)}</p>
                  <p className="text-xs text-gray-500">{fmt(stats.avgPerMile)}/mi</p>
                </div>
                <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-3">
                  <p className="text-xs text-blue-400">Mediana historica</p>
                  <p className="text-xl font-bold text-blue-400">{fmt(result.suggestedMedian)}</p>
                  <p className="text-xs text-gray-500">{fmt(stats.medianPerMile)}/mi</p>
                </div>
              </div>

              {result.suggestedSimilar && (
                <div className="bg-purple-600/10 border border-purple-600/30 rounded-lg p-3">
                  <p className="text-xs text-purple-400">Rutas similares ({result.similarCount} ordenes)</p>
                  <p className="text-xl font-bold text-purple-400">{fmt(result.suggestedSimilar)}</p>
                  <p className="text-xs text-gray-500">{fmt(result.similarRpm)}/mi</p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                <span>Rango: {fmt(result.suggestedLow)} - {fmt(result.suggestedHigh)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!stats && (
        <p className="text-sm text-gray-500">Cargando datos historicos...</p>
      )}
    </div>
  )
}
