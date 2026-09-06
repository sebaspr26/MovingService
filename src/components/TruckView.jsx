import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeWeeks, getActiveCycle, getAllCycles, openCycle, getLatestClosedCycle } from '../lib/cycles'
import { useAuth } from '../context/AuthContext'
import { canAccess, isSuperAdmin } from '../lib/permissions'
import OrdersTable from './OrdersTable'
import ExpensesTab from './ExpensesTab'
import AccountingTable from './AccountingTable'
import CashBox from './CashBox'
import OwnerExpensesTable from './OwnerExpensesTable'

function fmt_d(d) { return d.toISOString().split('T')[0] }

const BASE_TABS = [
  { key: 'orders', label: 'Orders' },
  { key: 'expenses', label: 'Gastos' },
  { key: 'accounting', label: 'Contabilidad' },
]

export default function TruckView() {
  const { id } = useParams()
  const { session, refreshSession } = useAuth()
  const userRole = session?.user?.user_metadata?.role

  // Refresh session on mount to pick up any permission changes since last login
  useEffect(() => { refreshSession() }, [])
  const isDriver = userRole === 'driver' || userRole === 'driver_lease'
  const [truck, setTruck] = useState(null)
  const [tab, setTab] = useState('orders')
  const [cycles, setCycles] = useState([])
  const [cycleIndex, setCycleIndex] = useState(0)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [summary, setSummary] = useState({ grossOrders: 0, income: 0, pending: 0, diesel: 0, def: 0, chofer: 0, expenses: 0, debito: 0, credito: 0 })
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
  // Reset tab if current tab is not available (e.g. driver lacks permission)
  const allTabs = truck?.is_lis
    ? [...BASE_TABS, { key: 'owner_expenses', label: 'Gastos Propietario' }]
    : BASE_TABS
  const TABS = isDriver ? allTabs.filter(t => {
    if (t.key === 'expenses') return canAccess(session, 'dashboard', 'ver_gastos')
    if (t.key === 'accounting') return canAccess(session, 'dashboard', 'ver_contabilidad')
    if (t.key === 'owner_expenses') return canAccess(session, 'dashboard', 'ver_gastos_propietario')
    return true // orders always visible
  }) : allTabs

  useEffect(() => {
    supabase.from('trucks').select('*').eq('id', id).single()
      .then(({ data }) => setTruck(data))
  }, [id])

  // Reset to 'orders' if current tab is not in available tabs
  useEffect(() => {
    if (TABS.length > 0 && !TABS.find(t => t.key === tab)) setTab('orders')
  }, [TABS.length])

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

    // If viewing a specific week, filter by cycle_id then sub-filter in JS
    const useWeekFilter = !!selectedWeek
    const [paidOrders, allOrders, diesel, def, expenses, accounting] = await Promise.all([
      supabase.from('orders').select('rate, apply_discount, discount_percent, pu_date').eq('truck_id', id)
        .eq('paid', true)
        .eq('cycle_id', cycle.id),
      supabase.from('orders').select('paid, pu_date').eq('truck_id', id)
        .eq('cycle_id', cycle.id),
      supabase.from('diesel').select('value, date').eq('truck_id', id)
        .eq('cycle_id', cycle.id),
      supabase.from('def').select('value, date').eq('truck_id', id)
        .eq('cycle_id', cycle.id),
      supabase.from('expenses').select('amount, category, date').eq('truck_id', id)
        .eq('cycle_id', cycle.id),
      supabase.from('accounting').select('debit, credit, date').eq('truck_id', id)
        .eq('cycle_id', cycle.id),
    ])

    // Sub-filter by week dates if a week is selected
    const weekFilter = (arr, dateField) => {
      if (!useWeekFilter) return arr
      return (arr || []).filter(r => r[dateField] >= period.start && r[dateField] <= period.end)
    }

    const filteredPaidOrders = weekFilter(paidOrders.data, 'pu_date')
    const filteredAllOrders = weekFilter(allOrders.data, 'pu_date')
    const filteredDiesel = weekFilter(diesel.data, 'date')
    const filteredDef = weekFilter(def.data, 'date')
    const filteredExpenses = weekFilter(expenses.data, 'date')
    const filteredAccounting = weekFilter(accounting.data, 'date')
    // Calcular ingreso bruto y neto respetando apply_discount y discount_percent por orden
    const grossOrders = filteredPaidOrders.reduce((s, r) => s + (Number(r.rate) || 0), 0)
    const netIncomeCalc = filteredPaidOrders.reduce((s, r) => {
      const rate = Number(r.rate) || 0
      const applyDisc = r.apply_discount !== false
      const pct = Number(r.discount_percent) || discountPct
      return s + (applyDisc ? rate * (1 - pct / 100) : rate)
    }, 0)

    setSummary({
      grossOrders,
      income: netIncomeCalc,
      pending: filteredAllOrders.filter(r => !r.paid).length,
      diesel: filteredDiesel.reduce((s, r) => s + (Number(r.value) || 0), 0),
      def: filteredDef.reduce((s, r) => s + (Number(r.value) || 0), 0),
      chofer: filteredExpenses.filter(r => r.category === 'Pago Chofer').reduce((s, r) => s + (Number(r.amount) || 0), 0),
      expenses: filteredExpenses.filter(r => r.category !== 'Pago Chofer').reduce((s, r) => s + (Number(r.amount) || 0), 0),
      debito: filteredAccounting.reduce((s, r) => s + (Number(r.debit) || 0), 0),
      credito: filteredAccounting.reduce((s, r) => s + (Number(r.credit) || 0), 0),
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
  // netIncome ya viene calculado en fetchSummary respetando apply_discount por orden
  const netIncome = summary.income
  const discountAmount = summary.grossOrders - netIncome
  const discount13 = 0
  const previousBalance = Number(cycle?.previous_balance) || 0
  const totalDebito = summary.diesel + summary.def + summary.chofer + summary.expenses + summary.debito
  const totalCredito = previousBalance + netIncome + summary.credito
  const balance = totalCredito - totalDebito

  if (!isSuperAdmin(session) && !isDriver && !canAccess(session, 'dashboard', 'ver_truck_view')) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <svg className="w-12 h-12 text-gray-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
      <p className="text-gray-500 text-sm">No tienes acceso a esta vista</p>
    </div>
  )

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="h-3 w-16 bg-gray-800 rounded mb-3"></div>
            <div className="h-7 w-24 bg-gray-800 rounded"></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="h-3 w-16 bg-gray-800 rounded mb-2"></div>
            <div className="h-4 w-20 bg-gray-800 rounded"></div>
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
          <p className="text-gray-400 mb-4">No hay ciclos para este camion.{isDriver ? ' Contacta al administrador para abrir un ciclo.' : ' Abre uno para comenzar.'}</p>
          {!isDriver && (openingCycle ? (
            <div className="inline-flex flex-col items-center gap-3">
              <label className="text-sm text-gray-400">Fecha de inicio del ciclo:</label>
              <input
                type="date"
                value={newCycleDate}
                onChange={(e) => setNewCycleDate(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
              />
              <div className="flex gap-2">
                <button onClick={() => setOpeningCycle(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleOpenCycle}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-500 transition-colors">
                  Abrir Ciclo
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setOpeningCycle(true)}
              className="px-6 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-500 transition-colors">
              Abrir Nuevo Ciclo
            </button>
          ))}
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
                <span className="ml-2 text-[10px] bg-orange-900/40 text-orange-400 px-1.5 py-0.5 rounded">Activo</span>
              )}
            </div>
            <button onClick={() => handleCycleShift(-1)} disabled={cycleIndex <= 0}
              className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {!hasActiveCycle && !isDriver && (
            <div className="mb-4">
              {openingCycle ? (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 inline-flex items-center gap-3">
                  <label className="text-sm text-gray-400">Fecha inicio:</label>
                  <input
                    type="date"
                    value={newCycleDate}
                    onChange={(e) => setNewCycleDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button onClick={() => setOpeningCycle(false)}
                    className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleOpenCycle}
                    className="px-3 py-2 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-500 transition-colors">
                    Abrir Ciclo
                  </button>
                </div>
              ) : (
                <button onClick={() => setOpeningCycle(true)}
                  className="px-4 py-2 bg-orange-600/20 border border-orange-600/40 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-600/30 transition-colors">
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
                !selectedWeek ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
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
                    ? 'bg-orange-600 text-white'
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

          {/* Cards grandes — Total Débito, Total Crédito, Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 border-l-4 border-l-red-500">
              <p className="text-xs text-gray-500 mb-2">Total Débito</p>
              <p className="text-xl sm:text-2xl font-bold text-red-400">{fmt(totalDebito)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 border-l-4 border-l-green-500">
              <p className="text-xs text-gray-500 mb-2">Total Crédito</p>
              <p className="text-xl sm:text-2xl font-bold text-green-400">{fmt(totalCredito)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 border-l-4 border-l-orange-500">
              <p className="text-xs text-gray-500 mb-2">Balance</p>
              <p className={`text-xl sm:text-2xl font-bold ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(balance)}</p>
            </div>
          </div>

          {/* Cards pequeñas — secundarias */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 mb-1">Gross Orders</p>
              <p className="text-sm font-bold text-green-400">{fmt(summary.grossOrders)}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">solo pagadas</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 mb-1">Neto (desc.)</p>
              <p className="text-sm font-bold text-emerald-400">{fmt(netIncome)}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">desc: -{fmt(discountAmount)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 mb-1">Saldo Anterior</p>
              <p className="text-sm font-bold text-gray-300">{fmt(Number(cycle?.previous_balance) || 0)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 mb-1">Pendientes</p>
              <p className={`text-sm font-bold ${summary.pending > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                {summary.pending}
              </p>
              <p className="text-[9px] text-gray-600 mt-0.5">ordenes</p>
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
            {tab === 'orders' && <OrdersTable truckId={id} period={period} cycle={cycle} onDataChange={fetchSummary} readOnly={readOnly} discountPct={discountPct} />}
            {tab === 'expenses' && <ExpensesTab truckId={id} period={period} cycle={cycle} onDataChange={fetchSummary} readOnly={readOnly} isLis={truck?.is_lis} />}
            {tab === 'accounting' && <AccountingTable truckId={id} period={period} cycle={cycle} onDataChange={fetchSummary} netIncome={netIncome} totalDiesel={summary.diesel} totalDef={summary.def} totalChofer={summary.chofer} totalExpenses={summary.expenses} discountPct={discountPct} readOnly={readOnly} previousBalance={previousBalance} />}
            {tab === 'owner_expenses' && <OwnerExpensesTable truckId={id} period={period} cycle={cycle} onDataChange={fetchSummary} readOnly={readOnly} ownerName={truck?.owner_name} />}
          </div>

          {/* Cash Box & Dividends — hidden for drivers */}
          {!isDriver && <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
            <CashBox
              truckId={id}
              cycle={cycle}
              period={period}
              debito={totalDebito}
              credito={totalCredito}
              grossIncome={summary.grossOrders}
              netIncome={netIncome}
              discount13={discount13}
              discountPct={discountPct}
              onCycleClosed={fetchCycles}
            />
          </div>}
        </>
      )}
    </div>
  )
}