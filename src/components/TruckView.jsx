import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import OrdersTable from './OrdersTable'
import DieselTable from './DieselTable'
import ExpensesTable from './ExpensesTable'
import AccountingTable from './AccountingTable'

function getWeekRange(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMon)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  }
}

function shiftWeek(start, end, direction) {
  const s = new Date(start)
  const e = new Date(end)
  s.setDate(s.getDate() + direction * 7)
  e.setDate(e.getDate() + direction * 7)
  return {
    start: s.toISOString().split('T')[0],
    end: e.toISOString().split('T')[0],
  }
}

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
  const [period, setPeriod] = useState(getWeekRange())
  const [summary, setSummary] = useState({ income: 0, diesel: 0, expenses: 0 })

  useEffect(() => {
    supabase.from('trucks').select('*').eq('id', id).single()
      .then(({ data }) => setTruck(data))
  }, [id])

  useEffect(() => {
    fetchSummary()
  }, [id, period])

  async function fetchSummary() {
    const [orders, diesel, expenses] = await Promise.all([
      supabase.from('orders').select('rate').eq('truck_id', id)
        .gte('period_start', period.start).lte('period_end', period.end),
      supabase.from('diesel').select('value').eq('truck_id', id)
        .gte('period_start', period.start).lte('period_end', period.end),
      supabase.from('expenses').select('amount').eq('truck_id', id)
        .gte('period_start', period.start).lte('period_end', period.end),
    ])
    setSummary({
      income: (orders.data || []).reduce((s, r) => s + (Number(r.rate) || 0), 0),
      diesel: (diesel.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0),
      expenses: (expenses.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
    })
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const totalExpenses = summary.diesel + summary.expenses
  const balance = summary.income - totalExpenses

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{truck.name}</h2>
          <p className="text-sm text-gray-500">#{truck.number}</p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3 mb-6 bg-gray-900 rounded-lg p-3 border border-gray-800 w-fit">
        <button
          onClick={() => setPeriod(p => shiftWeek(p.start, p.end, -1))}
          className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="text-sm">
          <span className="text-gray-400">Semana: </span>
          <span className="text-white font-medium">{period.start}</span>
          <span className="text-gray-600 mx-1">a</span>
          <span className="text-white font-medium">{period.end}</span>
        </div>
        <button
          onClick={() => setPeriod(p => shiftWeek(p.start, p.end, 1))}
          className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <button
          onClick={() => setPeriod(getWeekRange())}
          className="text-xs text-blue-400 hover:text-blue-300 ml-2"
        >
          Hoy
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Ingresos (Orders)</p>
          <p className="text-lg font-bold text-green-400">{fmt(summary.income)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Diesel</p>
          <p className="text-lg font-bold text-orange-400">{fmt(summary.diesel)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Otros Gastos</p>
          <p className="text-lg font-bold text-red-400">{fmt(summary.expenses)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Balance</p>
          <p className={`text-lg font-bold ${balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(balance)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 rounded-lg p-1 border border-gray-800 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        {tab === 'orders' && <OrdersTable truckId={id} period={period} />}
        {tab === 'diesel' && <DieselTable truckId={id} period={period} />}
        {tab === 'expenses' && <ExpensesTable truckId={id} period={period} />}
        {tab === 'accounting' && <AccountingTable truckId={id} period={period} />}
      </div>

      {/* Cash/Dividends panel */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Caja / Dividendos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Total Ingresos</p>
            <p className="text-xl font-bold text-green-400">{fmt(summary.income)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Total Gastos</p>
            <p className="text-xl font-bold text-red-400">{fmt(totalExpenses)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Neto (Disponible)</p>
            <p className={`text-xl font-bold ${balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(balance)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
