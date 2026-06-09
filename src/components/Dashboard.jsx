import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCycle, getLatestClosedCycle, openCycle, computeWeeks } from '../lib/cycles'
import { useToast, friendlyError } from './Toast'
import AddModal from './AddModal'

const EXPENSE_CATEGORIES = [
  'Mantenimiento', 'Seguro', 'Peajes', 'Reparacion', 'Llantas',
  'Lavado', 'Parqueo', 'Multas', 'Comida', 'Otros'
]

const orderFields = [
  { name: 'order_number', label: 'Orden #', required: true },
  { name: 'pu_date', label: 'Fecha Pickup', type: 'date', required: true },
  { name: 'pu_city', label: 'Ciudad Pickup', required: true },
  { name: 'do_date', label: 'Fecha Delivery', type: 'date', required: true },
  { name: 'do_city', label: 'Ciudad Delivery', required: true },
  { name: 'miles', label: 'Millas', type: 'number', step: '0.01' },
  { name: 'rate', label: 'Rate ($)', type: 'number', step: '0.01', required: true },
  { name: 'apply_discount', label: 'Aplicar descuento', type: 'toggle', default: true, rateField: 'rate' },
]

const dieselFields = [
  { name: 'invoice_number', label: 'Invoice #', required: true },
  { name: 'date', label: 'Fecha', type: 'date', required: true },
  { name: 'city', label: 'Ciudad', required: true },
  { name: 'gallons', label: 'Galones', type: 'number', step: '0.01', required: true },
  { name: 'value', label: 'Valor ($)', type: 'number', step: '0.01', required: true },
]

const defFields = [
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
  const toast = useToast()
  const [trucks, setTrucks] = useState([])
  const [truckCycles, setTruckCycles] = useState({})
  const [summaries, setSummaries] = useState({})
  const [showTruckModal, setShowTruckModal] = useState(false)
  const [editingTruck, setEditingTruck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteInput, setDeleteInput] = useState('')

  const [quickAdd, setQuickAdd] = useState(null)

  const [truckName, setTruckName] = useState('')
  const [truckNumber, setTruckNumber] = useState('')
  const [truckPartners, setTruckPartners] = useState([{ name: '', percentage: '' }])
  const [truckCajaInicial, setTruckCajaInicial] = useState('')
  const [truckDiscount, setTruckDiscount] = useState('13')
  const [truckDiscountCustom, setTruckDiscountCustom] = useState('')
  const [truckError, setTruckError] = useState('')

  const [openCycleTarget, setOpenCycleTarget] = useState(null)
  const [openCycleDate, setOpenCycleDate] = useState(new Date().toISOString().split('T')[0])

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { fetchTrucks() }, [])

  async function fetchTrucks() {
    const { data } = await supabase.from('trucks').select('*').order('number')
    setTrucks(data || [])
    if (data && data.length > 0) {
      await fetchCyclesAndSummaries(data)
    }
    setLoading(false)
  }

  async function fetchCyclesAndSummaries(truckList) {
    const cyclesMap = {}
    const sums = {}

    for (const truck of truckList) {
      const activeCycle = await getActiveCycle(truck.id)
      const displayCycle = activeCycle || await getLatestClosedCycle(truck.id)
      cyclesMap[truck.id] = displayCycle

      if (displayCycle) {
        const periodStart = displayCycle.start_date
        const weeks = computeWeeks(displayCycle.start_date, displayCycle.end_date, displayCycle.closed)
        const periodEnd = displayCycle.end_date || (weeks.length > 0 ? weeks[weeks.length - 1].end : today)

        const [orders, diesel, def, expenses, accounting] = await Promise.all([
          supabase.from('orders').select('rate, paid, apply_discount').eq('truck_id', truck.id)
            .gte('pu_date', periodStart).lte('pu_date', periodEnd),
          supabase.from('diesel').select('value').eq('truck_id', truck.id)
            .gte('date', periodStart).lte('date', periodEnd),
          supabase.from('def').select('value').eq('truck_id', truck.id)
            .gte('date', periodStart).lte('date', periodEnd),
          supabase.from('expenses').select('amount').eq('truck_id', truck.id)
            .gte('date', periodStart).lte('date', periodEnd),
          supabase.from('accounting').select('debit, credit').eq('truck_id', truck.id)
            .gte('date', periodStart).lte('date', periodEnd),
        ])

        const allOrders = orders.data || []
        const discountPct = Number(truck.discount_percent) || 13
        const netIncome = allOrders
          .filter(r => r.paid)
          .reduce((s, r) => {
            const rate = Number(r.rate) || 0
            const applyDisc = r.apply_discount !== false
            return s + (applyDisc ? rate * (1 - discountPct / 100) : rate)
          }, 0)

        const pendingOrders = allOrders.filter(r => !r.paid)
        const pendingCount = pendingOrders.length
        const pendingAmount = pendingOrders.reduce((s, r) => s + (Number(r.rate) || 0), 0)

        const dieselTotal = (diesel.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0)
        const defTotal = (def.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0)
        const expenseTotal = (expenses.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
        const acctDebit = (accounting.data || []).reduce((s, r) => s + (Number(r.debit) || 0), 0)
        const acctCredit = (accounting.data || []).reduce((s, r) => s + (Number(r.credit) || 0), 0)

        const totalDebito = dieselTotal + defTotal + expenseTotal + acctDebit
        const totalCredito = netIncome + acctCredit
        const balance = totalCredito - totalDebito

        sums[truck.id] = {
          income: totalCredito,
          expenses: totalDebito,
          balance,
          pendingCount,
          pendingAmount,
        }
      } else {
        sums[truck.id] = { income: 0, expenses: 0, balance: 0, pendingCount: 0, pendingAmount: 0 }
      }
    }

    setTruckCycles(cyclesMap)
    setSummaries(sums)
  }

  function openTruckModal(truck = null) {
    if (truck) {
      setEditingTruck(truck)
      setTruckName(truck.name)
      setTruckNumber(truck.number)
      setTruckDiscount(String(truck.discount_percent || 13))
      setTruckDiscountCustom('')
      if (!['13', '11'].includes(String(truck.discount_percent))) {
        setTruckDiscount('custom')
        setTruckDiscountCustom(String(truck.discount_percent || ''))
      }
      supabase.from('partners').select('*').eq('truck_id', truck.id).order('created_at')
        .then(({ data }) => {
          setTruckPartners(data && data.length > 0 ? data.map(p => ({ name: p.name, percentage: String(p.percentage) })) : [{ name: '', percentage: '' }])
        })
    } else {
      setEditingTruck(null)
      setTruckName('')
      setTruckNumber('')
      setTruckPartners([{ name: '', percentage: '' }])
      setTruckDiscount('13')
      setTruckDiscountCustom('')
    }
    setTruckCajaInicial('')
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

  async function handleSaveTruck(e) {
    e.preventDefault()
    setTruckError('')

    const validPartners = truckPartners.filter(p => p.name.trim() && p.percentage)
    if (validPartners.length > 0) {
      const totalPct = validPartners.reduce((s, p) => s + (Number(p.percentage) || 0), 0)
      if (Math.abs(totalPct - 100) > 0.01) {
        setTruckError(`Los porcentajes suman ${totalPct}% (deben sumar 100%)`)
        return
      }
    }

    const discountValue = truckDiscount === 'custom' ? (Number(truckDiscountCustom) || 0) : Number(truckDiscount)

    if (editingTruck) {
      const { error } = await supabase.from('trucks')
        .update({ name: truckName.trim(), number: truckNumber.trim(), discount_percent: discountValue })
        .eq('id', editingTruck.id)
      if (error) { setTruckError('Error actualizando camion'); toast.error('Error al actualizar camion'); return }

      await supabase.from('partners').delete().eq('truck_id', editingTruck.id)
      if (validPartners.length > 0) {
        await supabase.from('partners').insert(
          validPartners.map(p => ({
            truck_id: editingTruck.id,
            name: p.name.trim(),
            percentage: Number(p.percentage),
            invested: 0,
          }))
        )
      }
    } else {
      const { data: truck, error } = await supabase.from('trucks')
        .insert({ name: truckName.trim(), number: truckNumber.trim(), discount_percent: discountValue })
        .select().single()

      if (error || !truck) { setTruckError('Error creando camion'); toast.error('Error al crear camion'); return }

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

      const cajaInicial = Number(truckCajaInicial) || 0
      if (cajaInicial > 0) {
        await openCycle(truck.id, today, cajaInicial)
      }
    }

    setShowTruckModal(false)
    toast.success(editingTruck ? 'Camion actualizado' : 'Camion creado')
    setEditingTruck(null)
    await fetchTrucks()
  }

  async function handleDeleteTruck() {
    if (!deleteTarget || deleteInput !== deleteTarget.name) return
    const tid = deleteTarget.id
    await Promise.all([
      supabase.from('orders').delete().eq('truck_id', tid),
      supabase.from('diesel').delete().eq('truck_id', tid),
      supabase.from('def').delete().eq('truck_id', tid),
      supabase.from('expenses').delete().eq('truck_id', tid),
      supabase.from('accounting').delete().eq('truck_id', tid),
      supabase.from('cycles').delete().eq('truck_id', tid),
      supabase.from('partners').delete().eq('truck_id', tid),
    ])
    await supabase.from('trucks').delete().eq('id', tid)
    setDeleteTarget(null)
    setDeleteInput('')
    toast.success('Camion eliminado permanentemente')
    await fetchTrucks()
  }

  async function handleOpenCycleForTruck() {
    if (!openCycleTarget) return
    const lastClosed = await getLatestClosedCycle(openCycleTarget.id)
    const prevBalance = lastClosed ? Number(lastClosed.cuadre_caja) || 0 : 0
    await openCycle(openCycleTarget.id, openCycleDate, prevBalance)
    setOpenCycleTarget(null)
    toast.success('Nuevo ciclo abierto')
    await fetchTrucks()
  }

  function openQuickAdd(type) {
    setQuickAdd(type)
  }

  function handleQuickSaveWrapped(data) {
    const { _truck_select, ...rest } = data
    if (!_truck_select) return
    const cycle = truckCycles[_truck_select]
    if (!cycle) return

    const table = quickAdd === 'order' ? 'orders' : quickAdd === 'diesel' ? 'diesel' : quickAdd === 'def' ? 'def' : 'expenses'
    const periodStart = cycle.start_date
    const periodEnd = cycle.end_date || today

    const record = { ...rest, truck_id: _truck_select, period_start: periodStart, period_end: periodEnd }

    // Normalizar apply_discount a boolean real para orders
    if (quickAdd === 'order') {
      record.apply_discount = rest.apply_discount === false || rest.apply_discount === 'false' ? false : true
    }

    supabase.from(table).insert(record).then(({ error }) => {
      if (error) {
        toast.error(friendlyError(error.message))
      } else {
        setQuickAdd(null)
        toast.success('Registro agregado')
        fetchCyclesAndSummaries(trucks)
      }
    })
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

  const trucksWithCycles = trucks.filter(t => truckCycles[t.id] && !truckCycles[t.id].closed)

  function getQuickFields(baseFields) {
    const truckField = {
      name: '_truck_select',
      label: 'Camion',
      type: 'select',
      required: true,
      options: trucksWithCycles.map(t => ({ value: t.id, label: `${t.name} (#${t.number})` })),
    }
    return [truckField, ...baseFields]
  }

  // Para orders, enriquecer el campo toggle con el discountPct del camion seleccionado
  function getOrderFields(selectedTruckId) {
    const truck = trucks.find(t => t.id === selectedTruckId)
    const discountPct = Number(truck?.discount_percent) || 13
    return getQuickFields(orderFields.map(f =>
      f.name === 'apply_discount' ? { ...f, discountPct } : f
    ))
  }

  const quickConfig = {
    order: { fields: getQuickFields(orderFields), title: 'Agregar Orden' },
    diesel: { fields: getQuickFields(dieselFields), title: 'Agregar Diesel' },
    def: { fields: getQuickFields(defFields), title: 'Agregar DEF' },
    expense: { fields: getQuickFields(expenseFields), title: 'Agregar Gasto' },
  }

  const totalPct = truckPartners.reduce((s, p) => s + (Number(p.percentage) || 0), 0)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Resumen de camiones — ciclo activo</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          {trucksWithCycles.length > 0 && (
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
              <button onClick={() => openQuickAdd('def')}
                className="px-3 py-2 bg-cyan-600/20 border border-cyan-600/40 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-600/30 transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                DEF
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
          <button onClick={() => openTruckModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Agregar Camion
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="h-5 w-28 bg-gray-800 rounded mb-2"></div>
                  <div className="h-3 w-16 bg-gray-800 rounded"></div>
                </div>
              </div>
              <div className="h-3 w-36 bg-gray-800 rounded mb-3"></div>
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map(j => (
                  <div key={j}>
                    <div className="h-3 w-14 bg-gray-800 rounded mb-2"></div>
                    <div className="h-4 w-20 bg-gray-800 rounded"></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : trucks.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No hay camiones registrados</p>
          <p className="text-sm">Agrega tu primer camion para comenzar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trucks.map(truck => {
            const s = summaries[truck.id] || {}
            const displayCycle = truckCycles[truck.id]
            const isActive = displayCycle && !displayCycle.closed
            return (
              <div key={truck.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors group">
                <div className="flex items-start justify-between mb-4">
                  <Link to={`/truck/${truck.id}`} className="flex-1">
                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">{truck.name}</h3>
                    <p className="text-xs text-gray-500">#{truck.number}</p>
                  </Link>
                  <div className="flex gap-1">
                    <button onClick={() => openTruckModal(truck)}
                      className="p-1.5 text-gray-600 hover:text-blue-400 rounded sm:opacity-0 sm:group-hover:opacity-100 transition-all" title="Editar">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                      </svg>
                    </button>
                    <button onClick={() => { setDeleteTarget(truck); setDeleteInput('') }}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded sm:opacity-0 sm:group-hover:opacity-100 transition-all" title="Eliminar">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>

                {displayCycle ? (
                  <div>
                    <Link to={`/truck/${truck.id}`} className="block">
                      <div className="text-[10px] text-gray-600 mb-2 flex items-center gap-2">
                        <span>Ciclo: {displayCycle.start_date} → {isActive ? 'Activo' : displayCycle.end_date}</span>
                        {displayCycle.closed && (
                          <span className="text-[9px] bg-emerald-900/40 text-emerald-400 px-1 py-0.5 rounded">Cerrado</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Credito</p>
                          <p className="text-sm font-semibold text-green-400">{fmt(s.income)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Debito</p>
                          <p className="text-sm font-semibold text-red-400">{fmt(s.expenses)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Balance</p>
                          <p className={`text-sm font-semibold ${(s.balance || 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(s.balance)}</p>
                        </div>
                      </div>

                      {displayCycle.closed && Number(displayCycle.cuadre_caja) > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-800/50">
                          <p className="text-[10px] text-gray-500">Caja para siguiente ciclo: <span className="text-yellow-400 font-semibold">{fmt(displayCycle.cuadre_caja)}</span></p>
                        </div>
                      )}
                    </Link>

                    {!isActive && (
                      <div className="mt-3 pt-3 border-t border-gray-800">
                        {openCycleTarget?.id === truck.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={openCycleDate}
                              onChange={(e) => setOpenCycleDate(e.target.value)}
                              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500"
                            />
                            <button onClick={() => setOpenCycleTarget(null)}
                              className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700 transition-colors">
                              Cancelar
                            </button>
                            <button onClick={handleOpenCycleForTruck}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-500 transition-colors">
                              Abrir
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setOpenCycleTarget(truck); setOpenCycleDate(new Date().toISOString().split('T')[0]) }}
                            className="w-full px-3 py-1.5 bg-blue-600/20 border border-blue-600/40 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors">
                            + Abrir Nuevo Ciclo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-xs text-gray-500 mb-3">Sin ciclos</p>
                    {openCycleTarget?.id === truck.id ? (
                      <div className="flex flex-col items-center gap-2">
                        <input
                          type="date"
                          value={openCycleDate}
                          onChange={(e) => setOpenCycleDate(e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setOpenCycleTarget(null)}
                            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700 transition-colors">
                            Cancelar
                          </button>
                          <button onClick={handleOpenCycleForTruck}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-500 transition-colors">
                            Abrir
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setOpenCycleTarget(truck); setOpenCycleDate(new Date().toISOString().split('T')[0]) }}
                        className="px-4 py-2 bg-blue-600/20 border border-blue-600/40 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors">
                        Abrir Ciclo
                      </button>
                    )}
                  </div>
                )}
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

      {/* Create/Edit Truck Modal */}
      {showTruckModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">{editingTruck ? 'Editar Camion' : 'Agregar Camion'}</h3>
              <button onClick={() => { setShowTruckModal(false); setEditingTruck(null) }} className="text-gray-500 hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveTruck} className="p-4 space-y-4">
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-400">Socios</label>
                  <span className={`text-xs ${Math.abs(totalPct - 100) < 0.01 && truckPartners.some(p => p.percentage) ? 'text-green-400' : totalPct > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {totalPct > 0 ? `${totalPct}%` : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {truckPartners.map((p, i) => (
                    <div key={i} className="flex flex-wrap gap-2 items-center bg-gray-800/30 rounded-lg p-2 sm:p-0 sm:bg-transparent sm:rounded-none">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updatePartner(i, 'name', e.target.value)}
                        className="flex-1 min-w-[120px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Nombre"
                      />
                      <div className="relative w-20 sm:w-24">
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

              {!editingTruck && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Caja Inicial ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={truckCajaInicial}
                    onChange={(e) => setTruckCajaInicial(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="0.00 (saldo anterior del primer ciclo)"
                  />
                </div>
              )}

              {truckError && (
                <div className="bg-red-900/30 border border-red-800 rounded-lg p-3">
                  <p className="text-xs text-red-400">{truckError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTruckModal(false); setEditingTruck(null) }}
                  className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors"
                >
                  {editingTruck ? 'Guardar Cambios' : 'Crear Camion'}
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