import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeWeeks, getActiveCycle, getAllCycles, openCycle, getLatestClosedCycle } from '../lib/cycles'
import OrdersTable from './OrdersTable'
import DieselTable from './DieselTable'
import ExpensesTable from './ExpensesTable'
import AccountingTable from './AccountingTable'
import CashBox from './CashBox'

function fmt_d(d) { return d.toISOString().split('T')[0] }

const TABS = [
  { key: 'orders', label: 'Orders' },
  { key: 'diesel', label: 'Diesel' },
  { key: 'expenses', label: 'Gastos' },
  { key: 'accounting', label: 'Contabilidad' },
]

export default function TruckView() {
  const { id } = useParams()
  const [truck, setTruck] = useState(null)
  const [tab, setTab] = useState('orders')
  const [cycles, setCycles] = useState([])
  const [cycleIndex, setCycleIndex] = useState(0)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [summary, setSummary] = useState({ income: 0, pending: 0, diesel: 0, expenses: 0, debito: 0, credito: 0 })
  const [loading, setLoading] = useState(true)
  const [openingCycle, setOpeningCycle] = useState(false)
  const [newCycleDate, setNewCycleDate] = useState(fmt_d(new Date()))

  const cycle = cycles[cycleIndex] || null
  const readOnly = cycle?.closed || false
  const today = fmt_d(new Date())
  const weeks = cycle ? computeWeeks(cycle.start_date, cycle.end_date, cycle.closed) : []
  const cycleEnd = cycle?.end_date || (weeks.length > 0 ? weeks[weeks.length - 1].end : today)
  const period = selectedWeek || (cycle ? { start: cycle.start_date, end: cycleEnd } : { start: today, end: today })
  const hasActiveCycle = cycles.some(c => !c.closed)

  useEffect(() => {
    supabase.from('trucks').select('*').eq('id', id).single()
      .then(({ data }) => setTruck(data))
  }, [id])

  useEffect(() => { fetchCycles() }, [id])

  async function fetchCycles() {
    setLoading(true)
    const data = await getAllCycles(id)
    setCycles(data)
    setCycleIndex(0)
    setSelectedWeek(null)
    setLoading(false)
  }

  useEffect(() => {
    if (cycle) fetchSummary()
  }, [id, period.start, period.end, cycle?.id])

  async function fetchSummary() {
    if (!cycle) return
    const [paidOrders, allOrders, diesel, expenses, accounting] = await Promise.all([
      // Solo pagadas para ingresos
      supabase.from('orders').select('rate').eq('truck_id', id)
        .eq('paid', true)
        .gte('pu_date', period.start).lte('pu_date', period.end),
      // Todas para contar pendientes
      supabase.from('orders').select('paid').eq('truck_id', id)
        .gte('pu_date', period.start).lte('pu_date', period.end),
      supabase.from('diesel').select('value').eq('truck_id', id)
        .gte('date', period.start).lte('date', period.end),
      supabase.from('expenses').select('amount').eq('truck_id', id)
        .gte('date', period.start).lte('date', period.end),
      supabase.from('accounting').select('debit, credit').eq('truck_id', id)
        .gte('date', period.start).lte('date', period.end),
    ])
    setSummary({
      income: (paidOrders.data || []).reduce((s, r) => s + (Number(r.rate) || 0), 0),
      pending: (allOrders.data || []).filter(r => !r.paid).length,
      diesel: (diesel.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0),
      expenses: (expenses.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
      debito: (accounting.data || []).reduce((s, r) => s + (Number(r.debit) || 0), 0),
      credito: (accounting.data || []).reduce((s, r) => s + (Number(r.credit) || 0), 0),
    })
  }

  function handleCycleShift(dir) {
    const next = cycleIndex + dir
    if (next >= 0 && next < cycles.length) {
      setCycleIndex(next)
      setSelectedWeek(null)
    }
  }

  async function handleOpenCycle() {
    const lastClosed = await getLatestClosedCycle(id)
    const prevBalance = lastClosed ? Number(lastClosed.cuadre_caja) || 0 : 0
    await openCycle(id, newCycleDate, prevBalance)
    setOpeningCycle(false)
    await fetchCycles()
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const discountPct = Number(truck?.discount_percent) || 13
  const discountAmount = summary.income * (discountPct / 100)
  const netIncome = summary.income - discountAmount
  const discount13 = discountAmount
  const totalDebito = summary.diesel + summary.expenses + summary.debito
  const totalCredito = netIncome + summary.credito

  if (!truck || loading) return (
    <div className="animate-pulse">
      <div className="h-4 w-32 bg-gray-800 rounded mb-4"></div>
      <div className="mb-6">
        <div className="h-7 w-48 bg-gray-800 rounded mb-2"></div>
        <div className="h-3 w-20 bg-gray-800 rounded"></div>
      </div>
      <div className="h-10 w-64 bg-gray-800 rounded-lg mb-4"></div>
      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-8 w-16 bg-gray-800 rounded-lg"></div>)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
            <div className="h-3 w-16 bg-gray-800 rounded mb-2"></div>
            <div className="h-5 w-20 bg-gray-800 rounded"></div>
          </div>
        ))}
      </div>
      <div className="h-10 w-72 bg-gray-800 rounded-lg mb-4"></div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 h-48"></div>
    </div>
  )

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-gray-300 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-white">{truck.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">{truck.name}</h2>
        <p className="text-sm text-gray-500">#{truck.number}</p>
      </div>

      {cycles.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
          <p className="text-gray-400 mb-4">No hay ciclos para este camion. Abre uno para comenzar.</p>
          {openingCycle ? (
            <div className="inline-flex flex-col items-center gap-3">
              <label className="text-sm text-gray-400">Fecha de inicio del ciclo:</label>
              <input
                type="date"
                value={newCycleDate}
                onChange={(e) => setNewCycleDate(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <button onClick={() => setOpeningCycle(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleOpenCycle}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors">
                  Abrir Ciclo
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setOpeningCycle(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-500 transition-colors">
              Abrir Nuevo Ciclo
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Cycle selector */}
          <div className="flex items-center gap-3 mb-4 bg-gray-900 rounded-lg p-3 border border-gray-800 w-fit">
            <button onClick={() => handleCycleShift(1)} disabled={cycleIndex >= cycles.length - 1}
              className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="text-sm">
              <span className="text-white font-semibold">Ciclo {cycles.length - cycleIndex}</span>
              <span className="text-gray-400 ml-2">
                {cycle.start_date} → {cycle.end_date || 'Activo'}
              </span>
              {cycle.closed && (
                <span className="ml-2 text-[10px] bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded">Cerrado</span>
              )}
              {!cycle.closed && (
                <span className="ml-2 text-[10px] bg-blue-900/40 text-blue-400 px-1.5 py-0.5 rounded">Activo</span>
              )}
            </div>
            <button onClick={() => handleCycleShift(-1)} disabled={cycleIndex <= 0}
              className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {!hasActiveCycle && (
            <div className="mb-4">
              {openingCycle ? (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 inline-flex items-center gap-3">
                  <label className="text-sm text-gray-400">Fecha inicio:</label>
                  <input
                    type="date"
                    value={newCycleDate}
                    onChange={(e) => setNewCycleDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={() => setOpeningCycle(false)}
                    className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleOpenCycle}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-500 transition-colors">
                    Abrir Ciclo
                  </button>
                </div>
              ) : (
                <button onClick={() => setOpeningCycle(true)}
                  className="px-4 py-2 bg-blue-600/20 border border-blue-600/40 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors">
                  + Abrir Nuevo Ciclo
                </button>
              )}
            </div>
          )}

          {readOnly && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              <p className="text-xs text-gray-400">Este ciclo ha sido cerrado. No se permiten modificaciones.</p>
            </div>
          )}

          {/* Week filter */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setSelectedWeek(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !selectedWeek ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              Todo el ciclo
            </button>
            {weeks.map((w, i) => (
              <button
                key={w.start}
                onClick={() => setSelectedWeek(w)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedWeek?.start === w.start
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Sem {i + 1}
              </button>
            ))}
          </div>

          {/* Period indicator */}
          <div className="text-xs text-gray-500 mb-4">
            Mostrando: <span className="text-gray-300">{period.start}</span>
            <span className="mx-1">a</span>
            <span className="text-gray-300">{period.end}</span>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Gross Orders</p>
              <p className="text-sm sm:text-lg font-bold text-green-400">{fmt(summary.income)}</p>
              <p className="text-[9px] sm:text-[10px] text-gray-600 mt-0.5">solo pagadas</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Neto (-{discountPct}%)</p>
              <p className="text-sm sm:text-lg font-bold text-emerald-400">{fmt(netIncome)}</p>
              <p className="text-[9px] sm:text-[10px] text-gray-600 mt-0.5">-{fmt(discountAmount)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Diesel</p>
              <p className="text-sm sm:text-lg font-bold text-orange-400">{fmt(summary.diesel)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Otros Gastos</p>
              <p className="text-sm sm:text-lg font-bold text-red-400">{fmt(summary.expenses)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Debito</p>
              <p className="text-sm sm:text-lg font-bold text-red-400">{fmt(totalDebito)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Credito</p>
              <p className="text-sm sm:text-lg font-bold text-green-400">{fmt(totalCredito)}</p>
            </div>
            {/* Pendientes */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Pendientes</p>
              <p className={`text-sm sm:text-lg font-bold ${summary.pending > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                {summary.pending}
              </p>
              <p className="text-[9px] sm:text-[10px] text-gray-600 mt-0.5">ordenes</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-900 rounded-lg p-1 border border-gray-800 w-full sm:w-fit overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === t.key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5">
            {tab === 'orders' && <OrdersTable truckId={id} period={period} onDataChange={fetchSummary} readOnly={readOnly} />}
            {tab === 'diesel' && <DieselTable truckId={id} period={period} onDataChange={fetchSummary} readOnly={readOnly} />}
            {tab === 'expenses' && <ExpensesTable truckId={id} period={period} onDataChange={fetchSummary} readOnly={readOnly} />}
            {tab === 'accounting' && <AccountingTable truckId={id} period={period} onDataChange={fetchSummary} netIncome={netIncome} totalDiesel={summary.diesel} totalExpenses={summary.expenses} discountPct={discountPct} readOnly={readOnly} />}
          </div>

          {/* Cash Box & Dividends */}
          <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-white mb-5">Caja</h3>
            <CashBox
              truckId={id}
              cycle={cycle}
              period={period}
              debito={totalDebito}
              credito={totalCredito}
              grossIncome={summary.income}
              netIncome={netIncome}
              discount13={discount13}
              discountPct={discountPct}
              onCycleClosed={fetchCycles}
            />
          </div>
        </>
      )}
    </div>
  )
}