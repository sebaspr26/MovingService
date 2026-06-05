import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export default function CashBox({ truckId, period, debito, credito, onCuadreChange }) {
  const [previousBalance, setPreviousBalance] = useState(0)
  const [cuadreCaja, setCuadreCaja] = useState(0)
  const [cashboxId, setCashboxId] = useState(null)
  const [editingPrev, setEditingPrev] = useState(false)
  const [editingCuadre, setEditingCuadre] = useState(false)
  const [inputValue, setInputValue] = useState('')

  useEffect(() => { fetchCashbox() }, [truckId, period])

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
    } else {
      setPreviousBalance(0)
      setCuadreCaja(0)
      setCashboxId(null)
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
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">Caja</h3>

      {/* Flow visualization */}
      <div className="space-y-4">
        {/* Row 1: Debito & Credito */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-green-500">
            <p className="text-xs text-gray-500 mb-1">Total Debito (Ingresos)</p>
            <p className="text-xl font-bold text-green-400">{fmt(debito)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-red-500">
            <p className="text-xs text-gray-500 mb-1">Total Credito (Gastos)</p>
            <p className="text-xl font-bold text-red-400">{fmt(credito)}</p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
          </svg>
        </div>

        {/* Row 2: Balance del periodo */}
        <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 mb-1">Balance del Periodo (Debito - Credito)</p>
          <p className={`text-xl font-bold ${balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(balance)}</p>
        </div>

        {/* Row 3: Saldo anterior + Balance = Ganancia */}
        <div className="grid grid-cols-3 gap-3 items-end">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Saldo Anterior</p>
            {editingPrev ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveField('previous_balance', inputValue) }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button onClick={() => saveField('previous_balance', inputValue)} className="px-2 py-1 bg-blue-600 rounded text-xs text-white">Ok</button>
              </div>
            ) : (
              <p
                className="text-lg font-bold text-gray-300 cursor-pointer hover:text-blue-400 transition-colors"
                onClick={() => { setInputValue(previousBalance.toString()); setEditingPrev(true) }}
                title="Click para editar"
              >
                {fmt(previousBalance)}
              </p>
            )}
          </div>
          <div className="flex justify-center text-gray-600 pb-4">
            <span className="text-2xl">+</span>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-purple-500">
            <p className="text-xs text-gray-500 mb-1">Ganancia Total</p>
            <p className={`text-lg font-bold ${ganancia >= 0 ? 'text-purple-400' : 'text-red-400'}`}>{fmt(ganancia)}</p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
          </svg>
        </div>

        {/* Row 4: Cuadre de caja y A repartir */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-yellow-500">
            <p className="text-xs text-gray-500 mb-1">Cuadre de Caja (siguiente periodo)</p>
            {editingCuadre ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveField('cuadre_caja', inputValue) }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button onClick={() => saveField('cuadre_caja', inputValue)} className="px-2 py-1 bg-blue-600 rounded text-xs text-white">Ok</button>
              </div>
            ) : (
              <p
                className="text-lg font-bold text-yellow-400 cursor-pointer hover:text-yellow-300 transition-colors"
                onClick={() => { setInputValue(cuadreCaja.toString()); setEditingCuadre(true) }}
                title="Click para editar"
              >
                {fmt(cuadreCaja)}
              </p>
            )}
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-emerald-500">
            <p className="text-xs text-gray-500 mb-1">A Repartir (Dividendos)</p>
            <p className={`text-xl font-bold ${aRepartir >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(aRepartir)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
