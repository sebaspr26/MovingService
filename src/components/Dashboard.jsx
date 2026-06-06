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

const EXPENSE_CATEGORIES = [
  'Mantenimiento', 'Seguro', 'Peajes', 'Reparacion', 'Llantas',
  'Lavado', 'Parqueo', 'Multas', 'Comida', 'DEF', 'Otros'
]

const orderFields = [
  { name: 'order_number', label: 'Orden #', required: true },
  { name: 'pu_date', label: 'Fecha Pickup', type: 'date', required: true },
  { name: 'pu_city', label: 'Ciudad Pickup', required: true },
  { name: 'do_date', label: 'Fecha Delivery', type: 'date', required: true },
  { name: 'do_city', label: 'Ciudad Delivery', required: true },
  { name: 'miles', label: 'Millas', type: 'number', step: '0.01' },
  { name: 'rate', label: 'Rate ($)', type: 'number', step: '0.01', required: true },
]

const dieselFields = [
  { name: 'invoice_number', label: 'Invoice #', required: true },
  { name: 'date', label: 'Fecha', type: 'date', required: true },
  { name: 'city', label: 'Ciudad', required: true },
  { name: 'gallons', label: 'Galones', type: 'number', step: '0.01', required: true },
  { name: 'value', label: 'Valor ($)', type: 'number', step: '0.01', required: true },
]

const expenseFields = [
  { name: 'category', label: 'Categoria', type: 'select', required: true,
    options: EXPENSE_CATEGORIES.map(c => ({ value: c, label: c })) },
  { name: 'invoice_number', label: 'Invoice #' },
  { name: 'description', label: 'Descripcion', required: true },
  { name: 'amount', label: 'Monto ($)', type: 'number', step: '0.01', required: true },
  { name: 'date', label: 'Fecha', type: 'date', required: true },
]

export default function Dashboard() {
  const [trucks, setTrucks] = useState([])
  const [summaries, setSummaries] = useState({})
  const [monthData, setMonthData] = useState(getMonthRange())
  const [showTruckModal, setShowTruckModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteInput, setDeleteInput] = useState('')

  // Quick add state
  const [quickAdd, setQuickAdd] = useState(null) // 'order' | 'diesel' | 'expense' | null
  const [quickTruckId, setQuickTruckId] = useState('')

  // Truck creation form state
  const [truckName, setTruckName] = useState('')
  const [truckNumber, setTruckNumber] = useState('')
  const [truckPartners, setTruckPartners] = useState([{ name: '', percentage: '' }])
  const [truckCajaInicial, setTruckCajaInicial] = useState('')
  const [truckDiscount, setTruckDiscount] = useState('13')
  const [truckDiscountCustom, setTruckDiscountCustom] = useState('')
  const [truckError, setTruckError] = useState('')

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

  function openTruckModal() {
    setTruckName('')
    setTruckNumber('')
    setTruckPartners([{ name: '', percentage: '' }])
    setTruckCajaInicial('')
    setTruckDiscount('13')
    setTruckDiscountCustom('')
    setTruckError('')
    setShowTruckModal(true)
  }

  function addPartnerRow() {
    setTruckPartners(prev => [...prev, { name: '', percentage: '' }])
  }

  function updatePartner(index, field, value) {
    setTruckPartners(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  function removePartner(index) {
    setTruckPartners(prev => prev.filter((_, i) => i !== index))
  }

  async function handleCreateTruck(e) {
    e.preventDefault()
    setTruckError('')

    // Validate partners
    const validPartners = truckPartners.filter(p => p.name.trim() && p.percentage)
    if (validPartners.length > 0) {
      const totalPct = validPartners.reduce((s, p) => s + (Number(p.percentage) || 0), 0)
      if (Math.abs(totalPct - 100) > 0.01) {
        setTruckError(`Los porcentajes suman ${totalPct}% (deben sumar 100%)`)
        return
      }
    }

    // Create truck
    const discountValue = truckDiscount === 'custom' ? (Number(truckDiscountCustom) || 0) : Number(truckDiscount)
    const { data: truck, error } = await supabase.from('trucks')
      .insert({ name: truckName.trim(), number: truckNumber.trim(), discount_percent: discountValue })
      .select().single()

    if (error || !truck) {
      setTruckError('Error creando camion')
      return
    }

    // Create partners
    if (validPartners.length > 0) {
      await supabase.from('partners').insert(
        validPartners.map(p => ({
          truck_id: truck.id,
          name: p.name.trim(),
          percentage: Number(p.percentage),
          invested: 0,
        }))
      )
    }

    // Create initial cashbox if caja inicial provided
    const cajaInicial = Number(truckCajaInicial) || 0
    if (cajaInicial > 0) {
      await supabase.from('cashbox').insert({
        truck_id: truck.id,
        period_start: period.start,
        period_end: period.end,
        previous_balance: cajaInicial,
        cuadre_caja: 0,
        closed: false,
      })
    }

    setShowTruckModal(false)
    await fetchTrucks()
  }

  async function handleDeleteTruck() {
    if (!deleteTarget || deleteInput !== deleteTarget.name) return
    const id = deleteTarget.id
    await Promise.all([
      supabase.from('orders').delete().eq('truck_id', id),
      supabase.from('diesel').delete().eq('truck_id', id),
      supabase.from('expenses').delete().eq('truck_id', id),
      supabase.from('accounting').delete().eq('truck_id', id),
      supabase.from('cashbox').delete().eq('truck_id', id),
      supabase.from('partners').delete().eq('truck_id', id),
    ])
    await supabase.from('trucks').delete().eq('id', id)
    setDeleteTarget(null)
    setDeleteInput('')
    await fetchTrucks()
  }

  // Quick add handlers
  function openQuickAdd(type) {
    setQuickTruckId(trucks.length === 1 ? trucks[0].id : '')
    setQuickAdd(type)
  }

  async function handleQuickSave(data) {
    if (!quickTruckId) return
    const table = quickAdd === 'order' ? 'orders' : quickAdd === 'diesel' ? 'diesel' : 'expenses'
    const record = { ...data, truck_id: quickTruckId, period_start: period.start, period_end: period.end }
    const { error } = await supabase.from(table).insert(record)
    if (!error) {
      setQuickAdd(null)
      fetchSummaries()
    }
  }

  function handleMonthShift(dir) {
    setMonthData(shiftMonth(monthData.year, monthData.month, dir))
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

  // Build quick add fields with truck selector prepended
  function getQuickFields(baseFields) {
    const truckField = {
      name: '_truck_select',
      label: 'Camion',
      type: 'select',
      required: true,
      options: trucks.map(t => ({ value: t.id, label: `${t.name} (#${t.number})` })),
    }
    return [truckField, ...baseFields]
  }

  function handleQuickSaveWrapped(data) {
    const { _truck_select, ...rest } = data
    setQuickTruckId(_truck_select)
    if (!_truck_select) return
    const table = quickAdd === 'order' ? 'orders' : quickAdd === 'diesel' ? 'diesel' : 'expenses'
    const record = { ...rest, truck_id: _truck_select, period_start: period.start, period_end: period.end }
    supabase.from(table).insert(record).then(({ error }) => {
      if (!error) {
        setQuickAdd(null)
        fetchSummaries()
      }
    })
  }

  const quickConfig = {
    order: { fields: getQuickFields(orderFields), title: 'Agregar Orden' },
    diesel: { fields: getQuickFields(dieselFields), title: 'Agregar Diesel' },
    expense: { fields: getQuickFields(expenseFields), title: 'Agregar Gasto' },
  }

  const totalPct = truckPartners.reduce((s, p) => s + (Number(p.percentage) || 0), 0)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Resumen de camiones por periodo</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          {trucks.length > 0 && (
            <>
              <button onClick={() => openQuickAdd('order')}
                className="px-3 py-2 bg-green-600/20 border border-green-600/40 text-green-400 rounded-lg text-xs font-medium hover:bg-green-600/30 transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Orden
              </button>
              <button onClick={() => openQuickAdd('diesel')}
                className="px-3 py-2 bg-orange-600/20 border border-orange-600/40 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-600/30 transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Diesel
              </button>
              <button onClick={() => openQuickAdd('expense')}
                className="px-3 py-2 bg-red-600/20 border border-red-600/40 text-red-400 rounded-lg text-xs font-medium hover:bg-red-600/30 transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Gasto
              </button>
            </>
          )}
          <button onClick={openTruckModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Agregar Camion
          </button>
        </div>
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
                  <button onClick={() => { setDeleteTarget(truck); setDeleteInput('') }}
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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
            <div className="p-5 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">Eliminar {deleteTarget.name}</h3>
              <p className="text-sm text-gray-400 mt-2">
                Esta accion eliminara permanentemente el camion y <span className="text-red-400 font-medium">todos sus registros</span> (ordenes, diesel, gastos, contabilidad).
              </p>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-400 mb-2">
                Escribe <span className="text-white font-mono bg-gray-800 px-1.5 py-0.5 rounded">{deleteTarget.name}</span> para confirmar:
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-red-500"
                placeholder={deleteTarget.name}
                autoFocus
              />
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-800">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteInput('') }}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTruck}
                disabled={deleteInput !== deleteTarget.name}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Truck Modal (custom form) */}
      {showTruckModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">Agregar Camion</h3>
              <button onClick={() => setShowTruckModal(false)} className="text-gray-500 hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateTruck} className="p-4 space-y-4">
              {/* Truck info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={truckName}
                    onChange={(e) => setTruckName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Ej: Truck 109"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Numero</label>
                  <input
                    type="text"
                    value={truckNumber}
                    onChange={(e) => setTruckNumber(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Ej: 109"
                    required
                  />
                </div>
              </div>

              {/* Discount percentage */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Descuento sobre Orders (%)</label>
                <div className="flex gap-2">
                  {['13', '11'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => { setTruckDiscount(val); setTruckDiscountCustom('') }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        truckDiscount === val
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTruckDiscount('custom')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      truckDiscount === 'custom'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                    }`}
                  >
                    Otro
                  </button>
                  {truckDiscount === 'custom' && (
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.01"
                        value={truckDiscountCustom}
                        onChange={(e) => setTruckDiscountCustom(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-7 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Ej: 10"
                        autoFocus
                        required
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Partners section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-400">Socios</label>
                  <span className={`text-xs ${Math.abs(totalPct - 100) < 0.01 && truckPartners.some(p => p.percentage) ? 'text-green-400' : totalPct > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {totalPct > 0 ? `${totalPct}%` : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {truckPartners.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updatePartner(i, 'name', e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Nombre"
                      />
                      <div className="relative w-24">
                        <input
                          type="number"
                          step="0.01"
                          value={p.percentage}
                          onChange={(e) => updatePartner(i, 'percentage', e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-7 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                          placeholder="%"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                      </div>
                      {truckPartners.length > 1 && (
                        <button type="button" onClick={() => removePartner(i)} className="p-1.5 text-gray-500 hover:text-red-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addPartnerRow}
                  className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Agregar Socio
                </button>
              </div>

              {/* Caja inicial */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Caja Inicial ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={truckCajaInicial}
                  onChange={(e) => setTruckCajaInicial(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="0.00 (saldo anterior del primer mes)"
                />
              </div>

              {truckError && (
                <div className="bg-red-900/30 border border-red-800 rounded-lg p-3">
                  <p className="text-xs text-red-400">{truckError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTruckModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors"
                >
                  Crear Camion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Modals */}
      {quickAdd && (
        <AddModal
          isOpen={true}
          onClose={() => setQuickAdd(null)}
          onSave={handleQuickSaveWrapped}
          fields={quickConfig[quickAdd].fields}
          title={quickConfig[quickAdd].title}
          onScan={() => {}}
        />
      )}
    </div>
  )
}
