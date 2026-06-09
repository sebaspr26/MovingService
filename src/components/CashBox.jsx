import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { closeCycle, reopenCycle } from '../lib/cycles'
import { useToast } from './Toast'

export default function CashBox({ truckId, cycle, period, debito, credito, grossIncome, netIncome, discount13, discountPct, onCycleClosed }) {
  const toast = useToast()
  const [partners, setPartners] = useState([])
  const [showCierre, setShowCierre] = useState(false)
  const [cierreInput, setCierreInput] = useState('')
  const [cierreDate, setCierreDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchPartners() }, [truckId])

  async function fetchPartners() {
    const { data } = await supabase.from('partners').select('*')
      .eq('truck_id', truckId).order('created_at')
    setPartners(data || [])
  }

  async function handleCerrarCiclo() {
    if (!cycle) return
    const numCuadre = Number(cierreInput) || 0
    await closeCycle(cycle.id, numCuadre, cierreDate)
    setShowCierre(false)
    toast.success('Ciclo cerrado exitosamente')
    if (onCycleClosed) onCycleClosed()
  }

  async function handleReopen() {
    if (!cycle) return
    await reopenCycle(cycle.id)
    toast.warning('Ciclo reabierto')
    if (onCycleClosed) onCycleClosed()
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const previousBalance = Number(cycle?.previous_balance) || 0
  const cuadreCaja = Number(cycle?.cuadre_caja) || 0
  const closed = cycle?.closed || false
  const balance = credito - debito
  const ganancia = previousBalance + balance
  const inputCuadre = Number(cierreInput) || 0

  return (
    <div className="space-y-6">
      

      {/* CERRAR CICLO / CLOSED STATE */}
      {closed ? (
        <div className="bg-gradient-to-r from-emerald-900/20 to-gray-900 rounded-xl p-4 sm:p-5 border border-emerald-800/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <h4 className="text-sm font-semibold text-emerald-400">Ciclo Cerrado</h4>
            </div>
            <button onClick={handleReopen} className="text-xs text-gray-500 hover:text-yellow-400 transition-colors">
              Reabrir
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-800/60 rounded-lg p-4">
              <p className="text-[10px] sm:text-xs text-gray-400 mb-2">Dejado en Caja</p>
              <p className="text-xl sm:text-2xl font-bold text-yellow-400">{fmt(cuadreCaja)}</p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-4 border-l-4 border-emerald-500">
              <p className="text-[10px] sm:text-xs text-gray-400 mb-2">Repartido</p>
              <p className={`text-xl sm:text-2xl font-bold ${(ganancia - cuadreCaja) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(ganancia - cuadreCaja)}
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Dividendos por Socio</p>
          <div className="space-y-2">
            {partners.map(p => {
              const repartido = ganancia - cuadreCaja
              const share = repartido > 0 ? repartido * (p.percentage / 100) : 0
              return (
                <div key={p.name} className="bg-gray-800/40 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium text-sm">{p.name}</span>
                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{p.percentage}%</span>
                  </div>
                  <span className="text-emerald-400 font-semibold text-sm">{fmt(share)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : showCierre ? (
        <div className="bg-gradient-to-r from-yellow-900/20 to-gray-900 rounded-xl p-4 sm:p-5 border border-yellow-800/50">
          <h4 className="text-sm font-semibold text-yellow-400 mb-1">Cerrar Ciclo</h4>
          <p className="text-[10px] sm:text-xs text-gray-500 mb-4">Cuanto desea dejar en la caja para el siguiente ciclo?</p>

          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1">Fecha de cierre</label>
            <input
              type="date"
              value={cierreDate}
              onChange={(e) => setCierreDate(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-800/60 rounded-lg p-4">
              <p className="text-[10px] sm:text-xs text-gray-400 mb-2">Dejar en Caja</p>
              <input
                type="number"
                step="0.01"
                value={cierreInput}
                onChange={(e) => setCierreInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCerrarCiclo() }}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-lg font-bold focus:outline-none focus:border-yellow-500"
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="bg-gray-800/60 rounded-lg p-4 border-l-4 border-emerald-500">
              <p className="text-[10px] sm:text-xs text-gray-400 mb-2">A Repartir</p>
              <p className={`text-xl sm:text-2xl font-bold ${(ganancia - inputCuadre) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(ganancia - inputCuadre)}
              </p>
              <p className="text-[9px] sm:text-[10px] text-gray-600 mt-1">{fmt(ganancia)} - {fmt(inputCuadre)}</p>
            </div>
          </div>

          {(ganancia - inputCuadre) > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Dividendos por Socio</p>
              <div className="space-y-2">
                {partners.map(p => {
                  const share = (ganancia - inputCuadre) * (p.percentage / 100)
                  return (
                    <div key={p.name} className="bg-gray-800/40 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-medium text-sm">{p.name}</span>
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{p.percentage}%</span>
                      </div>
                      <span className="text-emerald-400 font-semibold text-sm">{fmt(share)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCerrarCiclo}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
            >
              Confirmar Cierre
            </button>
            <button
              onClick={() => setShowCierre(false)}
              className="px-4 py-2.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <button
            onClick={() => { setCierreInput(''); setCierreDate(new Date().toISOString().split('T')[0]); setShowCierre(true) }}
            className="px-6 py-3 bg-yellow-600 text-white rounded-xl text-sm font-semibold hover:bg-yellow-500 transition-colors shadow-lg shadow-yellow-600/20"
          >
            Cerrar Ciclo
          </button>
          <p className="text-[10px] text-gray-600 mt-2">Finalizar el ciclo y repartir dividendos</p>
        </div>
      )}
    </div>
  )
}
