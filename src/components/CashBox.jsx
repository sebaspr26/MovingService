import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function CashBox({ truckId, period, debito, credito, grossIncome, netIncome, discount13, onCuadreChange }) {
  const [previousBalance, setPreviousBalance] = useState(0)
  const [cuadreCaja, setCuadreCaja] = useState(0)
  const [cashboxId, setCashboxId] = useState(null)
  const [editingPrev, setEditingPrev] = useState(false)
  const [editingCuadre, setEditingCuadre] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [closed, setClosed] = useState(false)

  useEffect(() => { fetchCashbox() }, [truckId, period.start, period.end])

  useEffect(() => {
    if (onCuadreChange) onCuadreChange(cuadreCaja)
  }, [cuadreCaja])

  async function fetchCashbox() {
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
      setPreviousBalance(0)
      setCuadreCaja(0)
      setCashboxId(null)
      setClosed(false)
    }
  }

  async function saveField(field, value) {
    const numValue = Number(value) || 0
    const updates = { [field]: numValue }

    if (cashboxId) {
      await supabase.from('cashbox').update(updates).eq('id', cashboxId)
    } else {
      const record = {
        truck_id: truckId,
        period_start: period.start,
        period_end: period.end,
        previous_balance: field === 'previous_balance' ? numValue : previousBalance,
        cuadre_caja: field === 'cuadre_caja' ? numValue : cuadreCaja,
      }
      const { data } = await supabase.from('cashbox').insert(record).select().single()
      if (data) setCashboxId(data.id)
    }

    if (field === 'previous_balance') {
      setPreviousBalance(numValue)
      setEditingPrev(false)
    } else {
      setCuadreCaja(numValue)
      setEditingCuadre(false)
    }
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const balance = debito - credito
  const ganancia = previousBalance + balance
  const aRepartir = ganancia - cuadreCaja

  return (
    <div className="space-y-6">
      {/* ===== SALDO ANTERIOR ===== */}
      <div className="bg-gradient-to-r from-gray-800/80 to-gray-800/40 rounded-xl p-4 sm:p-5 border border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-1">Saldo Anterior (Caja Previa)</p>
            {editingPrev ? (
              <div className="flex gap-2 mt-1">
                <input
                  type="number"
                  step="0.01"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveField('previous_balance', inputValue); if (e.key === 'Escape') setEditingPrev(false) }}
                  className="w-40 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button onClick={() => saveField('previous_balance', inputValue)} className="px-3 py-1.5 bg-blue-600 rounded text-xs text-white hover:bg-blue-500">Guardar</button>
                <button onClick={() => setEditingPrev(false)} className="px-3 py-1.5 bg-gray-700 rounded text-xs text-gray-300 hover:bg-gray-600">Cancelar</button>
              </div>
            ) : (
              <p
                className="text-2xl sm:text-3xl font-bold text-white cursor-pointer hover:text-blue-400 transition-colors"
                onClick={() => { setInputValue(previousBalance.toString()); setEditingPrev(true) }}
                title="Click para editar"
              >
                {fmt(previousBalance)}
              </p>
            )}
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-500">Del periodo anterior</p>
            <p className="text-[10px] text-gray-600">Click en el monto para editar</p>
          </div>
        </div>
      </div>

      {/* ===== 13% DESCUENTO ===== */}
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

      {/* ===== DEBITO / CREDITO / BALANCE ===== */}
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

      {/* ===== GANANCIA TOTAL ===== */}
      <div className="bg-gray-800/50 rounded-lg p-4 sm:p-5 border-l-4 border-purple-500">
        <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Ganancia Total (Saldo Anterior + Balance)</p>
        <div className="flex items-baseline gap-2">
          <p className={`text-xl sm:text-2xl font-bold ${ganancia >= 0 ? 'text-purple-400' : 'text-red-400'}`}>{fmt(ganancia)}</p>
          <span className="text-xs text-gray-600">({fmt(previousBalance)} + {fmt(balance)})</span>
        </div>
      </div>

      {/* ===== CIERRE DE CAJA ===== */}
      <div className="bg-gradient-to-r from-yellow-900/20 to-gray-900 rounded-xl p-4 sm:p-5 border border-yellow-800/50">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-yellow-400">Cierre de Caja</h4>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Cuanto desea reservar para el siguiente periodo?</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Cuadre de caja */}
          <div className="bg-gray-800/60 rounded-lg p-4">
            <p className="text-[10px] sm:text-xs text-gray-400 mb-2">Reserva para siguiente periodo</p>
            {editingCuadre ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveField('cuadre_caja', inputValue); if (e.key === 'Escape') setEditingCuadre(false) }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-500"
                  autoFocus
                />
                <button onClick={() => saveField('cuadre_caja', inputValue)} className="px-3 py-1.5 bg-yellow-600 rounded text-xs text-white hover:bg-yellow-500">Ok</button>
              </div>
            ) : (
              <p
                className="text-xl sm:text-2xl font-bold text-yellow-400 cursor-pointer hover:text-yellow-300 transition-colors"
                onClick={() => { setInputValue(cuadreCaja.toString()); setEditingCuadre(true) }}
                title="Click para editar"
              >
                {fmt(cuadreCaja)}
              </p>
            )}
          </div>

          {/* A repartir */}
          <div className="bg-gray-800/60 rounded-lg p-4 border-l-4 border-emerald-500">
            <p className="text-[10px] sm:text-xs text-gray-400 mb-2">A Repartir (Dividendos)</p>
            <p className={`text-xl sm:text-2xl font-bold ${aRepartir >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(aRepartir)}</p>
            <p className="text-[9px] sm:text-[10px] text-gray-600 mt-1">{fmt(ganancia)} - {fmt(cuadreCaja)} = {fmt(aRepartir)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
