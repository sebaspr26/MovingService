import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AddModal from './AddModal'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function getMonthRange(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], year: y, month: m }
}

function shiftMonth(year, month, dir) {
  return getMonthRange(new Date(year, month + dir, 1))
}

const truckFields = [
  { name: 'name', label: 'Nombre', required: true, placeholder: 'Ej: Truck 109' },
  { name: 'number', label: 'Numero', required: true, placeholder: 'Ej: 109' },
]

export default function Dashboard() {
  const [trucks, setTrucks] = useState([])
  const [summaries, setSummaries] = useState({})
  const [monthData, setMonthData] = useState(getMonthRange())
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const period = { start: monthData.start, end: monthData.end }

  useEffect(() => { fetchTrucks() }, [])
  useEffect(() => { if (trucks.length > 0) fetchSummaries() }, [trucks, monthData])

  async function fetchTrucks() {
    const { data } = await supabase.from('trucks').select('*').order('number')
    setTrucks(data || [])
    setLoading(false)
  }

  async function fetchSummaries() {
    const sums = {}
    for (const truck of trucks) {
      const [orders, diesel, expenses] = await Promise.all([
        supabase.from('orders').select('rate').eq('truck_id', truck.id)
          .gte('period_start', period.start).lte('period_end', period.end),
        supabase.from('diesel').select('value').eq('truck_id', truck.id)
          .gte('period_start', period.start).lte('period_end', period.end),
        supabase.from('expenses').select('amount').eq('truck_id', truck.id)
          .gte('period_start', period.start).lte('period_end', period.end),
      ])
      const income = (orders.data || []).reduce((s, r) => s + (Number(r.rate) || 0), 0)
      const dieselTotal = (diesel.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0)
      const expenseTotal = (expenses.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
      sums[truck.id] = { income, expenses: dieselTotal + expenseTotal, balance: income - dieselTotal - expenseTotal }
    }
    setSummaries(sums)
  }

  async function handleAddTruck(data) {
    const { error } = await supabase.from('trucks').insert(data)
    if (!error) { await fetchTrucks(); setShowModal(false) }
  }

  async function handleDeleteTruck(id) {
    if (!confirm('Eliminar este camion y todos sus registros?')) return
    await Promise.all([
      supabase.from('orders').delete().eq('truck_id', id),
      supabase.from('diesel').delete().eq('truck_id', id),
      supabase.from('expenses').delete().eq('truck_id', id),
      supabase.from('accounting').delete().eq('truck_id', id),
    ])
    await supabase.from('trucks').delete().eq('id', id)
    await fetchTrucks()
  }

  function handleMonthShift(dir) {
    setMonthData(shiftMonth(monthData.year, monthData.month, dir))
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Resumen de camiones por periodo</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors flex items-center gap-2 self-start">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Agregar Camion
        </button>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3 mb-6 bg-gray-900 rounded-lg p-3 border border-gray-800 w-fit">
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
        <button onClick={() => setMonthData(getMonthRange())} className="text-xs text-blue-400 hover:text-blue-300 ml-2">Hoy</button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-12">Cargando...</div>
      ) : trucks.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No hay camiones registrados</p>
          <p className="text-sm">Agrega tu primer camion para comenzar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trucks.map(truck => {
            const s = summaries[truck.id] || {}
            return (
              <div key={truck.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors group">
                <div className="flex items-start justify-between mb-4">
                  <Link to={`/truck/${truck.id}`} className="flex-1">
                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">{truck.name}</h3>
                    <p className="text-xs text-gray-500">#{truck.number}</p>
                  </Link>
                  <button onClick={() => handleDeleteTruck(truck.id)}
                    className="p-1.5 text-gray-600 hover:text-red-400 rounded sm:opacity-0 sm:group-hover:opacity-100 transition-all" title="Eliminar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
                <Link to={`/truck/${truck.id}`} className="block">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Ingresos</p>
                      <p className="text-sm font-semibold text-green-400">{fmt(s.income)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Gastos</p>
                      <p className="text-sm font-semibold text-red-400">{fmt(s.expenses)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Balance</p>
                      <p className={`text-sm font-semibold ${(s.balance || 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(s.balance)}</p>
                    </div>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}

      <AddModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleAddTruck} fields={truckFields} title="Agregar Camion" />
    </div>
  )
}
