import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PARTNERS = [
  { name: 'Jairo', percentage: 20 },
  { name: 'Angela', percentage: 20 },
  { name: 'Simon', percentage: 30 },
  { name: 'Mateo', percentage: 30 },
]

export default function CashBox({ truckId, period, debito, credito, grossIncome, netIncome, discount13, onMonthClosed }) {
  const [previousBalance, setPreviousBalance] = useState(0)
  const [cuadreCaja, setCuadreCaja] = useState(0)
  const [cashboxId, setCashboxId] = useState(null)
  const [closed, setClosed] = useState(false)
  const [showCierre, setShowCierre] = useState(false)
  const [cierreInput, setCierreInput] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchCashbox() }, [truckId, period.start, period.end])

  async function fetchCashbox() {
    setLoading(true)
    setShowCierre(false)

    const { data } = await supabase.from('cashbox').select('*')
      .eq('truck_id', truckId)
      .eq('period_start', period.start)
      .eq('period_end', period.end)
      .maybeSingle()

    if (data) {
      setPreviousBalance(Number(data.previous_balance) || 0)
      setCuadreCaja(Number(data.cuadre_caja) || 0)
      setCashboxId(data.id)
      setClosed(!!data.closed)
    } else {
      const prevBalance = await fetchPreviousBalance()
      setPreviousBalance(prevBalance)
      setCuadreCaja(0)
      setCashboxId(null)
      setClosed(false)
    }
    setLoading(false)
  }

  async function fetchPreviousBalance() {
    const startDate = new Date(period.start + 'T00:00:00')
    const prevMonth = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1)
    const prevEnd = new Date(startDate.getFullYear(), startDate.getMonth(), 0)
    const prevStart = prevMonth.toISOString().split('T')[0]
    const prevEndStr = prevEnd.toISOString().split('T')[0]

    const { data } = await supabase.from('cashbox').select('cuadre_caja, closed')
      .eq('truck_id', truckId)
      .eq('period_start', prevStart)
      .eq('period_end', prevEndStr)
      .maybeSingle()

    return data?.closed ? (Number(data.cuadre_caja) || 0) : 0
  }

  async function handleCerrarMes() {
    const numCuadre = Number(cierreInput) || 0

    const record = {
      truck_id: truckId,
      period_start: period.start,
      period_end: period.end,
      previous_balance: previousBalance,
      cuadre_caja: numCuadre,
      closed: true,
    }

    if (cashboxId) {
      await supabase.from('cashbox').update(record).eq('id', cashboxId)
    } else {
      const { data } = await supabase.from('cashbox').insert(record).select().single()
      if (data) setCashboxId(data.id)
    }

    setCuadreCaja(numCuadre)
    setClosed(true)
    setShowCierre(false)

    if (onMonthClosed) onMonthClosed()
  }

  async function handleReopen() {
    if (!cashboxId) return
    await supabase.from('cashbox').update({ closed: false }).eq('id', cashboxId)
    setClosed(false)
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const balance = debito - credito
  const ganancia = previousBalance + balance
  const inputCuadre = Number(cierreInput) || 0

  if (loading) return <div className="text-gray-500 text-center py-4">Cargando caja...</div>

  return (
    <div className="space-y-6">
      {/* SALDO ANTERIOR */}
      <div className="bg-gradient-to-r from-gray-800/80 to-gray-800/40 rounded-xl p-4 sm:p-5 border border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-1">Saldo Anterior (del mes anterior)</p>
            <p className="text-2xl sm:text-3xl font-bold text-white">{fmt(previousBalance)}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-600">Se toma automaticamente del cierre anterior</p>
          </div>
        </div>
      </div>

      {/* 13% DESCUENTO */}
      {grossIncome > 0 && (
        <div className="bg-gray-800/30 rounded-lg p-3 sm:p-4 border border-gray-800">
          <p className="text-[10px] sm:text-xs text-gray-500 mb-2">Descuento 13% sobre Orders</p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <span className="text-gray-400">Gross: <span className="text-white font-semibold">{fmt(grossIncome)}</span></span>
            <span className="text-red-400">- 13%: <span className="font-semibold">{fmt(discount13)}</span></span>
            <span className="text-emerald-400">= Neto: <span className="font-semibold">{fmt(netIncome)}</span></span>
          </div>
        </div>
      )}

      {/* DEBITO / CREDITO / BALANCE */}
      <div>
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Contabilidad del Periodo</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 border-l-4 border-green-500">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Total Debito</p>
            <p className="text-lg sm:text-xl font-bold text-green-400">{fmt(debito)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 border-l-4 border-red-500">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Total Credito</p>
            <p className="text-lg sm:text-xl font-bold text-red-400">{fmt(credito)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 border-l-4 border-blue-500">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Balance (D - C)</p>
            <p className={`text-lg sm:text-xl font-bold ${balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(balance)}</p>
          </div>
        </div>
      </div>

      {/* GANANCIA TOTAL */}
      <div className="bg-gray-800/50 rounded-lg p-4 sm:p-5 border-l-4 border-purple-500">
        <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Ganancia Total (Saldo Anterior + Balance)</p>
        <div className="flex items-baseline gap-2">
          <p className={`text-xl sm:text-2xl font-bold ${ganancia >= 0 ? 'text-purple-400' : 'text-red-400'}`}>{fmt(ganancia)}</p>
          <span className="text-xs text-gray-600">({fmt(previousBalance)} + {fmt(balance)})</span>
        </div>
      </div>

      {/* CERRAR MES / CLOSED STATE */}
      {closed ? (
        <div className="bg-gradient-to-r from-emerald-900/20 to-gray-900 rounded-xl p-4 sm:p-5 border border-emerald-800/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <h4 className="text-sm font-semibold text-emerald-400">Mes Cerrado</h4>
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
            {PARTNERS.map(p => {
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
          <h4 className="text-sm font-semibold text-yellow-400 mb-1">Cerrar Mes</h4>
          <p className="text-[10px] sm:text-xs text-gray-500 mb-4">Cuanto desea dejar en la caja para el siguiente mes?</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-800/60 rounded-lg p-4">
              <p className="text-[10px] sm:text-xs text-gray-400 mb-2">Dejar en Caja</p>
              <input
                type="number"
                step="0.01"
                value={cierreInput}
                onChange={(e) => setCierreInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCerrarMes() }}
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
                {PARTNERS.map(p => {
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
              onClick={handleCerrarMes}
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
            onClick={() => { setCierreInput(''); setShowCierre(true) }}
            className="px-6 py-3 bg-yellow-600 text-white rounded-xl text-sm font-semibold hover:bg-yellow-500 transition-colors shadow-lg shadow-yellow-600/20"
          >
            Cerrar Mes
          </button>
          <p className="text-[10px] text-gray-600 mt-2">Finalizar el mes y repartir dividendos</p>
        </div>
      )}
    </div>
  )
}
