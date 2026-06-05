import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function CashBox({ truckId, period, income, totalExpenses }) {
  const [previousBalance, setPreviousBalance] = useState(0)
  const [cashboxId, setCashboxId] = useState(null)
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')

  useEffect(() => { fetchCashbox() }, [truckId, period])

  async function fetchCashbox() {
    const { data } = await supabase.from('cashbox').select('*')
      .eq('truck_id', truckId)
      .eq('period_start', period.start)
      .eq('period_end', period.end)
      .maybeSingle()

    if (data) {
      setPreviousBalance(Number(data.previous_balance) || 0)
      setCashboxId(data.id)
    } else {
      // Try to calculate from previous period's closing balance
      const prevEnd = new Date(period.start)
      prevEnd.setDate(prevEnd.getDate() - 1)
      const prevStart = new Date(prevEnd)
      prevStart.setDate(prevStart.getDate() - 6)

      const prevPeriod = {
        start: prevStart.toISOString().split('T')[0],
        end: prevEnd.toISOString().split('T')[0],
      }

      const { data: prevCash } = await supabase.from('cashbox').select('*')
        .eq('truck_id', truckId)
        .eq('period_start', prevPeriod.start)
        .eq('period_end', prevPeriod.end)
        .maybeSingle()

      // If previous period has a cashbox, calculate what the closing was
      if (prevCash) {
        const [prevOrders, prevDiesel, prevExpenses] = await Promise.all([
          supabase.from('orders').select('rate').eq('truck_id', truckId)
            .eq('period_start', prevPeriod.start).eq('period_end', prevPeriod.end),
          supabase.from('diesel').select('value').eq('truck_id', truckId)
            .eq('period_start', prevPeriod.start).eq('period_end', prevPeriod.end),
          supabase.from('expenses').select('amount').eq('truck_id', truckId)
            .eq('period_start', prevPeriod.start).eq('period_end', prevPeriod.end),
        ])
        const prevIncome = (prevOrders.data || []).reduce((s, r) => s + (Number(r.rate) || 0), 0)
        const prevTotalExp = (prevDiesel.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0)
          + (prevExpenses.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
        const prevClosing = (Number(prevCash.previous_balance) || 0) + prevIncome - prevTotalExp
        setPreviousBalance(prevClosing)
      } else {
        setPreviousBalance(0)
      }
      setCashboxId(null)
    }
  }

  async function savePreviousBalance(value) {
    const numValue = Number(value) || 0
    if (cashboxId) {
      await supabase.from('cashbox').update({ previous_balance: numValue }).eq('id', cashboxId)
    } else {
      const { data } = await supabase.from('cashbox').insert({
        truck_id: truckId,
        period_start: period.start,
        period_end: period.end,
        previous_balance: numValue,
      }).select().single()
      if (data) setCashboxId(data.id)
    }
    setPreviousBalance(numValue)
    setEditing(false)
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const netPeriod = income - totalExpenses
  const closingBalance = previousBalance + netPeriod

  return (
    <div>
      <h4 className="text-sm font-semibold text-white mb-4">Caja</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-800/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Saldo Anterior</p>
          {editing ? (
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') savePreviousBalance(inputValue) }}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <button
                onClick={() => savePreviousBalance(inputValue)}
                className="px-2 py-1 bg-blue-600 rounded text-xs text-white hover:bg-blue-500"
              >
                Ok
              </button>
            </div>
          ) : (
            <p
              className="text-lg font-bold text-gray-300 cursor-pointer hover:text-blue-400 transition-colors"
              onClick={() => { setInputValue(previousBalance.toString()); setEditing(true) }}
              title="Click para editar"
            >
              {fmt(previousBalance)}
            </p>
          )}
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Ingresos Periodo</p>
          <p className="text-lg font-bold text-green-400">{fmt(income)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Gastos Periodo</p>
          <p className="text-lg font-bold text-red-400">{fmt(totalExpenses)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Saldo Final</p>
          <p className={`text-lg font-bold ${closingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt(closingBalance)}
          </p>
        </div>
      </div>
    </div>
  )
}
