import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import OrdersTable from './OrdersTable'
import DieselTable from './DieselTable'
import ExpensesTable from './ExpensesTable'
import AccountingTable from './AccountingTable'
import CashBox from './CashBox'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function getMonthRange(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  return { start: fmt_d(start), end: fmt_d(end), year: y, month: m }
}

function shiftMonth(year, month, dir) {
  const d = new Date(year, month + dir, 1)
  return getMonthRange(d)
}

function getWeeksInMonth(year, month) {
  const last = new Date(year, month + 1, 0)
  const lastDay = last.getDate()
  return [
    { start: fmt_d(new Date(year, month, 1)), end: fmt_d(new Date(year, month, 7)) },
    { start: fmt_d(new Date(year, month, 8)), end: fmt_d(new Date(year, month, 14)) },
    { start: fmt_d(new Date(year, month, 15)), end: fmt_d(new Date(year, month, 21)) },
    { start: fmt_d(new Date(year, month, 22)), end: fmt_d(new Date(year, month, lastDay)) },
  ]
}

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
  const now = new Date()
  const [monthData, setMonthData] = useState(getMonthRange(now))
  const [selectedWeek, setSelectedWeek] = useState(null) // null = full month
  const [summary, setSummary] = useState({ income: 0, diesel: 0, expenses: 0, debito: 0, credito: 0 })

  const period = selectedWeek || { start: monthData.start, end: monthData.end }
  const weeks = getWeeksInMonth(monthData.year, monthData.month)

  useEffect(() => {
    supabase.from('trucks').select('*').eq('id', id).single()
      .then(({ data }) => setTruck(data))
  }, [id])

  useEffect(() => {
    fetchSummary()
  }, [id, period.start, period.end])

  async function fetchSummary() {
    const [orders, diesel, expenses, accounting] = await Promise.all([
      supabase.from('orders').select('rate').eq('truck_id', id)
        .gte('pu_date', period.start).lte('pu_date', period.end),
      supabase.from('diesel').select('value').eq('truck_id', id)
        .gte('date', period.start).lte('date', period.end),
      supabase.from('expenses').select('amount').eq('truck_id', id)
        .gte('date', period.start).lte('date', period.end),
      supabase.from('accounting').select('debit, credit').eq('truck_id', id)
        .gte('period_start', period.start).lte('period_end', period.end),
    ])
    setSummary({
      income: (orders.data || []).reduce((s, r) => s + (Number(r.rate) || 0), 0),
      diesel: (diesel.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0),
      expenses: (expenses.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
      debito: (accounting.data || []).reduce((s, r) => s + (Number(r.debit) || 0), 0),
      credito: (accounting.data || []).reduce((s, r) => s + (Number(r.credit) || 0), 0),
    })
  }

  function handleMonthShift(dir) {
    setMonthData(shiftMonth(monthData.year, monthData.month, dir))
    setSelectedWeek(null)
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const discountPct = Number(truck?.discount_percent) || 13
  const discountAmount = summary.income * (discountPct / 100)
  const netIncome = summary.income - discountAmount
  const totalExpenses = summary.diesel + summary.expenses
  // Debito/credito = auto (from orders/diesel/expenses) + manual (from accounting table)
  const discount13 = discountAmount // alias for props
  const totalDebito = netIncome + summary.debito
  const totalCredito = summary.diesel + summary.expenses + summary.credito

  if (!truck) return <div className="text-gray-500 text-center py-12">Cargando...</div>

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

      {/* Month selector */}
      <div className="flex items-center gap-3 mb-4 bg-gray-900 rounded-lg p-3 border border-gray-800 w-fit">
        <button onClick={() => handleMonthShift(-1)} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="text-sm">
          <span className="text-white font-semibold">{MONTH_NAMES[monthData.month]}</span>
          <span className="text-gray-400 ml-2">{monthData.year}</span>
        </div>
        <button onClick={() => handleMonthShift(1)} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <button
          onClick={() => { setMonthData(getMonthRange(new Date())); setSelectedWeek(null) }}
          className="text-xs text-blue-400 hover:text-blue-300 ml-2"
        >
          Hoy
        </button>
      </div>

      {/* Month ended banner */}
      {(() => {
        const today = new Date()
        const monthEnd = new Date(monthData.year, monthData.month + 1, 0)
        const isCurrentOrFuture = monthData.year > today.getFullYear() || (monthData.year === today.getFullYear() && monthData.month >= today.getMonth())
        const isPastMonth = today > monthEnd && !isCurrentOrFuture
        return isPastMonth ? (
          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-xs text-yellow-400">Este mes ya finalizo. Cierra la caja para abrir el siguiente periodo.</p>
          </div>
        ) : null
      })()}

      {/* Week filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelectedWeek(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !selectedWeek ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Todo el mes
        </button>
        {weeks.map((w, i) => {
          const today = fmt_d(new Date())
          const isCurrentMonth = monthData.year === new Date().getFullYear() && monthData.month === new Date().getMonth()
          const enabled = !isCurrentMonth || today >= w.start
          return (
            <button
              key={w.start}
              onClick={() => enabled && setSelectedWeek(w)}
              disabled={!enabled}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !enabled
                  ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                  : selectedWeek?.start === w.start
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              Sem {i + 1}
            </button>
          )
        })}
      </div>

      {/* Period indicator */}
      <div className="text-xs text-gray-500 mb-4">
        Mostrando: <span className="text-gray-300">{period.start}</span>
        <span className="mx-1">a</span>
        <span className="text-gray-300">{period.end}</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Gross Orders</p>
          <p className="text-sm sm:text-lg font-bold text-green-400">{fmt(summary.income)}</p>
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
          <p className="text-sm sm:text-lg font-bold text-green-400">{fmt(totalDebito)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Credito</p>
          <p className="text-sm sm:text-lg font-bold text-red-400">{fmt(totalCredito)}</p>
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
        {tab === 'orders' && <OrdersTable truckId={id} period={period} onDataChange={fetchSummary} />}
        {tab === 'diesel' && <DieselTable truckId={id} period={period} onDataChange={fetchSummary} />}
        {tab === 'expenses' && <ExpensesTable truckId={id} period={period} onDataChange={fetchSummary} />}
        {tab === 'accounting' && <AccountingTable truckId={id} period={period} onDataChange={fetchSummary} netIncome={netIncome} totalDiesel={summary.diesel} totalExpenses={summary.expenses} discountPct={discountPct} />}
      </div>

      {/* Cash Box & Dividends */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-white mb-5">Caja</h3>
        <CashBox
          truckId={id}
          period={period}
          debito={totalDebito}
          credito={totalCredito}
          grossIncome={summary.income}
          netIncome={netIncome}
          discount13={discount13}
          discountPct={discountPct}
          onMonthClosed={() => handleMonthShift(1)}
        />
      </div>
    </div>
  )
}
