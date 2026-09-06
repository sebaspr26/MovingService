import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCycle, getLatestClosedCycle, openCycle, computeWeeks } from '../lib/cycles'
import { useToast, friendlyError } from './Toast'
import AddReceiptModal from './AddReceiptModal'
import OrderDetail from './OrderDetail'
import DayPicker from './DayPicker'
import { getActiveCompanyId } from '../lib/company'
import { useAuth } from '../context/AuthContext'
import { canAccess, isSuperAdmin, getAllowedTruckIds } from '../lib/permissions'

// Cache dashboard data to avoid re-fetching on every navigation
let dashboardCache = { trucks: null, cycles: null, summaries: null, drivers: null, ts: 0 }
const CACHE_TTL = 30000 // 30 seconds

const EXPENSE_CATEGORIES = [
  'Mantenimiento', 'Seguro', 'Peajes', 'Reparacion', 'Llantas',
  'Lavado', 'Parqueo', 'Multas', 'Comida', 'Otros'
]


export default function Dashboard() {
  const toast = useToast()
  const { session } = useAuth()
  const [trucks, setTrucks] = useState([])
  const [truckCycles, setTruckCycles] = useState({})
  const [summaries, setSummaries] = useState({})
  const [showTruckModal, setShowTruckModal] = useState(false)
  const [editingTruck, setEditingTruck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteInput, setDeleteInput] = useState('')

  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false)
  const [orderDrawerVisible, setOrderDrawerVisible] = useState(false)

  const [truckName, setTruckName] = useState('')
  const [truckNumber, setTruckNumber] = useState('')
  const [truckDriverId, setTruckDriverId] = useState('')
  const [drivers, setDrivers] = useState([])
  const [truckPartners, setTruckPartners] = useState([{ name: '', percentage: '' }])
  const [truckCajaInicial, setTruckCajaInicial] = useState('')
  const [truckDiscount, setTruckDiscount] = useState('13')
  const [truckDiscountCustom, setTruckDiscountCustom] = useState('')
  const [truckError, setTruckError] = useState('')
  const [truckRecurring, setTruckRecurring] = useState([])
  const [truckIsLis, setTruckIsLis] = useState(false)
  const [truckOwnerName, setTruckOwnerName] = useState('')
  const [truckVin, setTruckVin] = useState('')

  // Recurring expenses banner
  const [pendingRecurring, setPendingRecurring] = useState([])
  const [applyingRecurring, setApplyingRecurring] = useState(null)

  const [openCycleTarget, setOpenCycleTarget] = useState(null)
  const [openCycleDate, setOpenCycleDate] = useState(new Date().toISOString().split('T')[0])

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    // Use cache if fresh enough
    if (dashboardCache.trucks && Date.now() - dashboardCache.ts < CACHE_TTL) {
      setTrucks(dashboardCache.trucks)
      setDrivers(dashboardCache.drivers || [])
      setTruckCycles(dashboardCache.cycles || {})
      setSummaries(dashboardCache.summaries || {})
      setLoading(false)
      return
    }
    fetchTrucks(); fetchDrivers(); fetchPendingRecurring()
  }, [])

  async function fetchDrivers() {
    const cId = getActiveCompanyId()
    const dq = supabase.from('drivers').select('id, name, truck_id, status').order('name')
    const { data } = cId ? await dq.eq('company_id', cId) : await dq
    const allowedIds = getAllowedTruckIds(session)
    const filtered = allowedIds
      ? (data || []).filter(d => !d.truck_id || allowedIds.includes(d.truck_id))
      : (data || [])
    setDrivers(filtered)
    dashboardCache.drivers = filtered
  }

  async function fetchPendingRecurring() {
    const todayDay = new Date().getDate()
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    const cId = getActiveCompanyId()
    const rq = supabase.from('recurring_expenses').select('*, trucks!inner(name, number, company_id)')
      .eq('active', true)
      .eq('day_of_month', todayDay)
    if (cId) rq.eq('trucks.company_id', cId)
    const { data } = await rq
    if (!data) return
    // Filter out already applied this month
    const notApplied = data.filter(r => r.last_applied_month !== currentMonth)
    // Filter out trucks with closed cycles (no active cycle = don't charge)
    const pending = []
    for (const rec of notApplied) {
      const cycle = await getActiveCycle(rec.truck_id)
      if (cycle) pending.push(rec)
    }
    setPendingRecurring(pending)
  }

  async function handleApplyRecurring(rec) {
    const ok = await toast.confirm(`¿Aplicar gasto recurrente "${rec.description}" por $${Number(rec.amount).toFixed(2)} al camion ${rec.trucks?.name || ''}?`, { confirmText: 'Aplicar', confirmClass: 'bg-amber-600 hover:bg-amber-500' })
    if (!ok) return
    setApplyingRecurring(rec.id)
    try {
      const truckId = rec.truck_id
      const cycle = await getActiveCycle(truckId)
      if (!cycle) {
        toast.error('No hay ciclo abierto para este camion')
        setApplyingRecurring(null)
        return
      }
      const todayDate = new Date().toISOString().split('T')[0]

      await supabase.from('expenses').insert({
        truck_id: truckId, cycle_id: cycle.id, category: 'Recurrente',
        invoice_number: 'REC', description: rec.description, amount: Number(rec.amount),
        date: todayDate, period_start: todayDate, period_end: todayDate,
      })

      // Mark as applied this month
      const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      await supabase.from('recurring_expenses').update({ last_applied_month: currentMonth }).eq('id', rec.id)

      setPendingRecurring(prev => prev.filter(r => r.id !== rec.id))
      dashboardCache.ts = 0 // invalidate cache
      toast.success(`Gasto recurrente aplicado: ${rec.description}`)
      fetchTrucks()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setApplyingRecurring(null)
    }
  }

  async function handleDismissRecurring(rec) {
    const ok = await toast.confirm(`¿Seguro que NO deseas aplicar "${rec.description}" este mes?`, { confirmText: 'Omitir', confirmClass: 'bg-gray-600 hover:bg-gray-500' })
    if (!ok) return
    // Mark as applied so it won't show again this month
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    await supabase.from('recurring_expenses').update({ last_applied_month: currentMonth }).eq('id', rec.id)
    setPendingRecurring(prev => prev.filter(r => r.id !== rec.id))
  }

  async function fetchTrucks() {
    const companyId = getActiveCompanyId()
    const query = supabase.from('trucks').select('*').order('number')
    const { data } = companyId ? await query.eq('company_id', companyId) : await query
    const allData = data || []

    const role = session?.user?.user_metadata?.role
    const isDriver = role === 'driver' || role === 'driver_lease'

    let filtered
    if (isDriver) {
      // Drivers only see their assigned truck from the drivers table
      const { data: driverRecord } = await supabase
        .from('drivers').select('truck_id').eq('email', session?.user?.email).maybeSingle()
      filtered = driverRecord?.truck_id
        ? allData.filter(t => t.id === driverRecord.truck_id)
        : []
    } else {
      const allowedIds = getAllowedTruckIds(session)
      filtered = allowedIds ? allData.filter(t => allowedIds.includes(t.id)) : allData
    }

    setTrucks(filtered)
    if (filtered.length > 0) {
      await fetchCyclesAndSummaries(filtered)
    }
    dashboardCache.trucks = filtered
    dashboardCache.ts = Date.now()
    setLoading(false)
  }

  async function fetchCyclesAndSummaries(truckList) {
    // Fetch all cycles and summaries in parallel instead of sequentially
    const results = await Promise.all(truckList.map(async (truck) => {
      const activeCycle = await getActiveCycle(truck.id)
      const displayCycle = activeCycle || await getLatestClosedCycle(truck.id)

      if (!displayCycle) {
        return { truckId: truck.id, cycle: null, summary: { income: 0, expenses: 0, balance: 0, pendingCount: 0, pendingAmount: 0 } }
      }

      const [orders, diesel, def, expenses, accounting] = await Promise.all([
        supabase.from('orders').select('rate, paid, apply_discount, discount_percent').eq('truck_id', truck.id)
          .eq('cycle_id', displayCycle.id),
        supabase.from('diesel').select('value').eq('truck_id', truck.id)
          .eq('cycle_id', displayCycle.id),
        supabase.from('def').select('value').eq('truck_id', truck.id)
          .eq('cycle_id', displayCycle.id),
        supabase.from('expenses').select('amount').eq('truck_id', truck.id)
          .eq('cycle_id', displayCycle.id),
        supabase.from('accounting').select('debit, credit').eq('truck_id', truck.id)
          .eq('cycle_id', displayCycle.id),
      ])

      const allOrders = orders.data || []
      const truckDiscountPct = Number(truck.discount_percent) || 13
      const netIncome = allOrders
        .filter(r => r.paid)
        .reduce((s, r) => {
          const rate = Number(r.rate) || 0
          const applyDisc = r.apply_discount !== false
          const pct = Number(r.discount_percent) || truckDiscountPct
          return s + (applyDisc ? rate * (1 - pct / 100) : rate)
        }, 0)

      const pendingOrders = allOrders.filter(r => !r.paid)
      const pendingCount = pendingOrders.length
      const pendingAmount = pendingOrders.reduce((s, r) => s + (Number(r.rate) || 0), 0)

      const dieselTotal = (diesel.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0)
      const defTotal = (def.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0)
      const expenseTotal = (expenses.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
      const acctDebit = (accounting.data || []).reduce((s, r) => s + (Number(r.debit) || 0), 0)
      const acctCredit = (accounting.data || []).reduce((s, r) => s + (Number(r.credit) || 0), 0)

      const previousBalance = Number(displayCycle.previous_balance) || 0
      const totalDebito = dieselTotal + defTotal + expenseTotal + acctDebit
      const totalCredito = previousBalance + netIncome + acctCredit
      const balance = totalCredito - totalDebito

      return {
        truckId: truck.id,
        cycle: displayCycle,
        summary: { income: totalCredito, expenses: totalDebito, balance, pendingCount, pendingAmount },
      }
    }))

    const cyclesMap = {}
    const sums = {}
    results.forEach(r => {
      cyclesMap[r.truckId] = r.cycle
      sums[r.truckId] = r.summary
    })
    setTruckCycles(cyclesMap)
    setSummaries(sums)
    dashboardCache.cycles = cyclesMap
    dashboardCache.summaries = sums
  }

  function openTruckModal(truck = null) {
    if (truck) {
      setEditingTruck(truck)
      setTruckName(truck.name)
      setTruckNumber(truck.number)
      setTruckIsLis(truck.is_lis || false)
      setTruckOwnerName(truck.owner_name || '')
      setTruckVin(truck.vin_number || '')
      setTruckDiscount(String(truck.discount_percent || 13))
      setTruckDiscountCustom('')
      if (!['13', '11'].includes(String(truck.discount_percent))) {
        setTruckDiscount('custom')
        setTruckDiscountCustom(String(truck.discount_percent || ''))
      }
      // Find driver assigned to this truck
      const assignedDriver = drivers.find(d => d.truck_id === truck.id)
      setTruckDriverId(assignedDriver?.id || '')
      supabase.from('partners').select('*').eq('truck_id', truck.id).order('created_at')
        .then(({ data }) => {
          setTruckPartners(data && data.length > 0 ? data.map(p => ({ name: p.name, percentage: String(p.percentage) })) : [{ name: '', percentage: '' }])
        })
      supabase.from('recurring_expenses').select('*').eq('truck_id', truck.id).order('created_at')
        .then(({ data }) => {
          setTruckRecurring(data && data.length > 0 ? data.map(r => ({ id: r.id, description: r.description, amount: String(r.amount), day_of_month: r.day_of_month })) : [])
        })
    } else {
      setEditingTruck(null)
      setTruckName('')
      setTruckNumber('')
      setTruckDriverId('')
      setTruckIsLis(false)
      setTruckOwnerName('')
      setTruckVin('')
      setTruckPartners([{ name: '', percentage: '' }])
      setTruckRecurring([])
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

  function addRecurringRow() {
    setTruckRecurring(prev => [...prev, { id: null, description: '', amount: '', day_of_month: null }])
  }

  function updateRecurring(index, field, value) {
    setTruckRecurring(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function removeRecurring(index) {
    setTruckRecurring(prev => prev.filter((_, i) => i !== index))
  }

  async function saveRecurringExpenses(truckId) {
    const validRecurring = truckRecurring.filter(r => r.description.trim() && r.amount && r.day_of_month)
    await supabase.from('recurring_expenses').delete().eq('truck_id', truckId)
    if (validRecurring.length > 0) {
      await supabase.from('recurring_expenses').insert(
        validRecurring.map(r => ({
          truck_id: truckId,
          description: r.description.trim(),
          amount: Number(r.amount),
          day_of_month: r.day_of_month,
        }))
      )
    }
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

    if (!editingTruck && !truckDriverId) {
      setTruckError('Debes asignar un conductor al camion')
      return
    }

    if (truckIsLis && !truckOwnerName.trim()) {
      setTruckError('El nombre del propietario es requerido para trucks LEASE')
      return
    }

    const discountValue = truckDiscount === 'custom' ? (Number(truckDiscountCustom) || 0) : Number(truckDiscount)

    if (editingTruck) {
      const { error } = await supabase.from('trucks')
        .update({ name: truckName.trim(), number: truckNumber.trim(), discount_percent: discountValue, is_lis: truckIsLis, owner_name: truckIsLis ? truckOwnerName.trim() : null, vin_number: truckVin.trim() || null })
        .eq('id', editingTruck.id)
      if (error) { setTruckError('Error actualizando camion'); toast.error('Error al actualizar camion'); return }

      // Update driver assignment: unassign previous, assign new
      await supabase.from('drivers').update({ truck_id: null }).eq('truck_id', editingTruck.id)
      if (truckDriverId) {
        await supabase.from('drivers').update({ truck_id: editingTruck.id }).eq('id', truckDriverId)
      }

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

      // Save recurring expenses
      await saveRecurringExpenses(editingTruck.id)
    } else {
      const { data: truck, error } = await supabase.from('trucks')
        .insert({ name: truckName.trim(), number: truckNumber.trim(), discount_percent: discountValue, is_lis: truckIsLis, owner_name: truckIsLis ? truckOwnerName.trim() : null, vin_number: truckVin.trim() || null, company_id: getActiveCompanyId() })
        .select().single()

      if (error || !truck) { setTruckError('Error creando camion'); toast.error('Error al crear camion'); return }

      // Assign driver to new truck
      if (truckDriverId) {
        await supabase.from('drivers').update({ truck_id: truck.id }).eq('id', truckDriverId)
      }

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

      // Save recurring expenses
      await saveRecurringExpenses(truck.id)
    }

    setShowTruckModal(false)
    toast.success(editingTruck ? 'Camion actualizado' : 'Camion creado')
    setEditingTruck(null)
    await fetchTrucks()
    await fetchDrivers()
    fetchPendingRecurring()
  }

  async function handleDeleteTruck() {
    if (!deleteTarget || deleteInput !== 'SimoN.2004') return
    const tid = deleteTarget.id

    // Audit log: registrar quien elimino y desde donde
    try {
      let ipData = {}
      try {
        const ipRes = await fetch('https://ipapi.co/json/')
        ipData = await ipRes.json()
      } catch (e) { /* si falla, continuar sin IP */ }

      await supabase.from('audit_log').insert({
        action: 'delete_truck',
        entity_type: 'truck',
        entity_id: tid,
        entity_name: deleteTarget.name,
        user_agent: navigator.userAgent,
        ip_address: ipData.ip || null,
        extra_info: {
          truck_number: deleteTarget.number,
          truck_discount: deleteTarget.discount_percent,
          is_lis: deleteTarget.is_lis,
          owner_name: deleteTarget.owner_name,
          screen: `${screen.width}x${screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          language: navigator.language,
          languages: navigator.languages,
          platform: navigator.platform,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          cpu_cores: navigator.hardwareConcurrency,
          ram_gb: navigator.deviceMemory || null,
          touch_points: navigator.maxTouchPoints,
          connection: navigator.connection?.effectiveType || null,
          timestamp_local: new Date().toString(),
          ip_city: ipData.city || null,
          ip_region: ipData.region || null,
          ip_country: ipData.country_name || null,
          ip_isp: ipData.org || null,
        }
      })
    } catch (e) { /* no bloquear eliminacion si falla el log */ }

    await Promise.all([
      supabase.from('orders').delete().eq('truck_id', tid),
      supabase.from('diesel').delete().eq('truck_id', tid),
      supabase.from('def').delete().eq('truck_id', tid),
      supabase.from('expenses').delete().eq('truck_id', tid),
      supabase.from('owner_expenses').delete().eq('truck_id', tid),
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

  function openOrderDrawer() {
    setOrderDrawerOpen(true)
    requestAnimationFrame(() => setOrderDrawerVisible(true))
  }

  function closeOrderDrawer() {
    setOrderDrawerVisible(false)
    setTimeout(() => setOrderDrawerOpen(false), 300)
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

  const trucksWithCycles = trucks.filter(t => truckCycles[t.id] && !truckCycles[t.id].closed)

  const totalPct = truckPartners.reduce((s, p) => s + (Number(p.percentage) || 0), 0)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Resumen de camiones — ciclo activo</p>
        </div>
        {/* Balance - mobile: centered card */}
        {trucks.length > 0 && !loading && (
          <div className="sm:hidden bg-gray-900 border border-gray-800 rounded-xl px-6 py-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Balance Total</p>
            <p className={`text-xl font-bold ${
              Object.values(summaries).reduce((s, v) => s + (Number(v.balance) || 0), 0) >= 0
                ? 'text-green-400' : 'text-red-400'
            }`}>
              {fmt(Object.values(summaries).reduce((s, v) => s + (Number(v.balance) || 0), 0))}
            </p>
          </div>
        )}
        {/* Balance - desktop: right notch */}
        {trucks.length > 0 && !loading && (
          <div className="hidden sm:flex -mr-6 px-5 py-3 bg-gray-900 border border-gray-800 border-r-0 rounded-l-xl text-sm font-medium items-center gap-3">
            <span className="text-gray-500 uppercase tracking-wider text-xs">Balance</span>
            <span className={`text-lg font-bold ${
              Object.values(summaries).reduce((s, v) => s + (Number(v.balance) || 0), 0) >= 0
                ? 'text-green-400' : 'text-red-400'
            }`}>
              {fmt(Object.values(summaries).reduce((s, v) => s + (Number(v.balance) || 0), 0))}
            </span>
          </div>
        )}
      </div>

      {/* Floating action buttons - desktop: vertical stack visible */}
      <div className="fixed bottom-6 right-6 z-40 hidden sm:flex flex-col gap-3 items-end">
        <button onClick={() => openTruckModal()}
          className="px-5 py-3 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-500 transition-colors shadow-lg flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
          Camion
        </button>
        {trucksWithCycles.length > 0 && (
          <>
            <button onClick={() => openOrderDrawer()}
              className="px-4 py-2.5 bg-green-600/20 border border-green-600/40 text-green-400 rounded-xl text-sm font-medium hover:bg-green-600/30 transition-colors flex items-center gap-2 backdrop-blur-sm shadow-lg">
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Orden
            </button>
            <button onClick={() => setShowExpenseModal(true)}
              className="px-4 py-2.5 bg-red-600/20 border border-red-600/40 text-red-400 rounded-xl text-sm font-medium hover:bg-red-600/30 transition-colors flex items-center gap-2 backdrop-blur-sm shadow-lg">
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Gasto
            </button>
          </>
        )}
      </div>

      {/* Floating action button - mobile: expandable */}
      {fabOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 sm:hidden transition-opacity duration-200" onClick={() => setFabOpen(false)} />
      )}
      <div className="fixed bottom-6 right-6 z-40 sm:hidden flex flex-col items-end gap-3">
        <div className={`flex flex-col gap-2 items-end transition-all duration-300 ease-out ${fabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          <button onClick={() => { openTruckModal(); setFabOpen(false) }}
            className={`px-4 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-500 shadow-lg flex items-center gap-2 transition-all duration-300 ${fabOpen ? 'opacity-100 translate-y-0 delay-100' : 'opacity-0 translate-y-3'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
            Camion
          </button>
          {trucksWithCycles.length > 0 && (
            <>
              <button onClick={() => { openOrderDrawer(); setFabOpen(false) }}
                className={`px-3 py-2 bg-green-600/20 border border-green-600/40 text-green-400 rounded-lg text-xs font-medium shadow-lg flex items-center gap-1.5 backdrop-blur-sm transition-all duration-300 ${fabOpen ? 'opacity-100 translate-y-0 delay-150' : 'opacity-0 translate-y-3'}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Orden
              </button>
              <button onClick={() => { setShowExpenseModal(true); setFabOpen(false) }}
                className={`px-3 py-2 bg-red-600/20 border border-red-600/40 text-red-400 rounded-lg text-xs font-medium shadow-lg flex items-center gap-1.5 backdrop-blur-sm transition-all duration-300 ${fabOpen ? 'opacity-100 translate-y-0 delay-200' : 'opacity-0 translate-y-3'}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Gasto
              </button>
            </>
          )}
        </div>
        <button onClick={() => setFabOpen(!fabOpen)}
          className={`p-3.5 bg-orange-600 text-white rounded-full shadow-xl hover:bg-orange-500 transition-all duration-300 ease-out ${fabOpen ? 'rotate-45 scale-110' : 'scale-100'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Recurring expenses banner */}
      {pendingRecurring.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <h3 className="text-sm font-semibold text-amber-300">
                {pendingRecurring.length === 1 ? 'Gasto recurrente pendiente' : `${pendingRecurring.length} gastos recurrentes pendientes`}
              </h3>
            </div>
            <div className="space-y-2">
              {pendingRecurring.map(rec => (
                  <div key={rec.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-900/60 rounded-lg p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-200 font-medium truncate">{rec.description}</p>
                        <p className="text-xs text-gray-500">{rec.trucks?.name} #{rec.trucks?.number} — {fmt(Number(rec.amount))}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleDismissRecurring(rec)}
                        className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs font-medium hover:text-white transition-colors"
                      >
                        Omitir
                      </button>
                      <button
                        onClick={() => handleApplyRecurring(rec)}
                        disabled={applyingRecurring === rec.id}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {applyingRecurring === rec.id ? (
                          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        )}
                        Aplicar
                      </button>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
            const assignedDriver = drivers.find(d => d.truck_id === truck.id)
            return (
              <div key={truck.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors group">
                <div className="flex items-start justify-between mb-4">
                  <Link to={`/truck/${truck.id}`} className="flex-1">
                    <h3 className="text-lg font-semibold text-white group-hover:text-orange-400 transition-colors">Truck {truck.number} <span className="text-gray-400">—</span> {truck.name}</h3>
                    <p className="text-xs text-gray-500">#{truck.number}{assignedDriver ? ` · ${assignedDriver.name}` : ''}</p>
                  </Link>
                  <div className="flex gap-1">
                    <button onClick={() => openTruckModal(truck)}
                      className="p-1.5 text-gray-600 hover:text-orange-400 rounded sm:opacity-0 sm:group-hover:opacity-100 transition-all" title="Editar">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                      </svg>
                    </button>
                    {(isSuperAdmin(session) || canAccess(session, 'dashboard', 'eliminar_camiones')) && (
                    <button onClick={() => { setDeleteTarget(truck); setDeleteInput('') }}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded sm:opacity-0 sm:group-hover:opacity-100 transition-all" title="Eliminar">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                    )}
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
                          <p className={`text-sm font-semibold ${(s.balance || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(s.balance)}</p>
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
                              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-orange-500"
                            />
                            <button onClick={() => setOpenCycleTarget(null)}
                              className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700 transition-colors">
                              Cancelar
                            </button>
                            <button onClick={handleOpenCycleForTruck}
                              className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-500 transition-colors">
                              Abrir
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setOpenCycleTarget(truck); setOpenCycleDate(new Date().toISOString().split('T')[0]) }}
                            className="w-full px-3 py-1.5 bg-orange-600/20 border border-orange-600/40 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-600/30 transition-colors">
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
                          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-orange-500"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setOpenCycleTarget(null)}
                            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700 transition-colors">
                            Cancelar
                          </button>
                          <button onClick={handleOpenCycleForTruck}
                            className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-500 transition-colors">
                            Abrir
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setOpenCycleTarget(truck); setOpenCycleDate(new Date().toISOString().split('T')[0]) }}
                        className="px-4 py-2 bg-orange-600/20 border border-orange-600/40 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-600/30 transition-colors">
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
                Ingresa la <span className="text-red-400 font-medium">contrasena de administrador</span> para confirmar:
              </p>
              <input
                type="password"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-red-500"
                placeholder="Contrasena"
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
                disabled={deleteInput !== 'SimoN.2004'}
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
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Truck</label>
                  <input
                    type="text"
                    value={truckName}
                    onChange={(e) => setTruckName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Ej: CARLOS"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Numero</label>
                  <input
                    type="text"
                    value={truckNumber}
                    onChange={(e) => setTruckNumber(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Ej: 109"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">VIN #</label>
                <input
                  type="text"
                  value={truckVin}
                  onChange={(e) => setTruckVin(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500 font-mono"
                  placeholder="1FUJA6CK07LY12345"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Chofer Asignado</label>
                <select
                  value={truckDriverId}
                  onChange={(e) => setTruckDriverId(e.target.value)}
                  className="sel w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="">{editingTruck ? 'Sin asignar' : 'Seleccionar conductor...'}</option>
                  {drivers
                    .filter(d => d.status === 'active' && (!d.truck_id || d.truck_id === editingTruck?.id))
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))
                  }
                </select>
                <p className="text-[10px] text-gray-600 mt-1">Los choferes se crean en Compania → Choferes</p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-400">Truck LEASE (propietario externo)</label>
                  <button
                    type="button"
                    onClick={() => setTruckIsLis(!truckIsLis)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${truckIsLis ? 'bg-amber-600' : 'bg-gray-700'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${truckIsLis ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {truckIsLis && (
                  <input
                    type="text"
                    value={truckOwnerName}
                    onChange={(e) => setTruckOwnerName(e.target.value)}
                    className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-amber-500"
                    placeholder="Nombre del propietario"
                    required
                  />
                )}
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
                          ? 'bg-orange-600 text-white'
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
                        ? 'bg-orange-600 text-white'
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
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-7 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
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
                        className="flex-1 min-w-[120px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
                        placeholder="Nombre"
                      />
                      <div className="relative w-20 sm:w-24">
                        <input
                          type="number"
                          step="0.01"
                          value={p.percentage}
                          onChange={(e) => updatePartner(i, 'percentage', e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-7 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
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
                  className="mt-2 text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Agregar Socio
                </button>
              </div>

              {/* Gastos Recurrentes */}
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">Gastos Recurrentes</label>
                {truckRecurring.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {truckRecurring.map((r, i) => (
                      <div key={i} className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <div className="grid grid-cols-3 gap-2 flex-1">
                            <input
                              type="text"
                              value={r.description}
                              onChange={(e) => updateRecurring(i, 'description', e.target.value)}
                              className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-orange-500"
                              placeholder="Nombre"
                            />
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={r.amount}
                                onChange={(e) => updateRecurring(i, 'amount', e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-6 pr-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-orange-500"
                                placeholder="Valor"
                              />
                            </div>
                            <DayPicker
                              value={r.day_of_month}
                              onChange={(day) => updateRecurring(i, 'day_of_month', day)}
                              placeholder="Dia del mes"
                            />
                          </div>
                          <button type="button" onClick={() => removeRecurring(i)} className="p-1 text-gray-500 hover:text-red-400 shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={addRecurringRow}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Agregar Gasto Recurrente
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
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
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-500 transition-colors"
                >
                  {editingTruck ? 'Guardar Cambios' : 'Crear Camion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Expense Modal (unified receipt) */}
      <AddReceiptModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSaved={() => { setShowExpenseModal(false); fetchCyclesAndSummaries(trucks) }}
        truckId={null}
        period={null}
        editRow={null}
        truckOptions={trucksWithCycles.map(t => ({ value: t.id, label: `${t.name} (#${t.number})` }))}
        truckCycles={truckCycles}
      />

      {/* Order Detail Drawer */}
      {orderDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${orderDrawerVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeOrderDrawer}
          />
          <div
            className={`relative w-full max-w-4xl bg-gray-950 border-l border-gray-800 shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-out ${
              orderDrawerVisible ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="p-4 sm:p-6">
              <OrderDetail
                key="new-order"
                orderId="new"
                onClose={closeOrderDrawer}
                onSaved={() => { fetchCyclesAndSummaries(trucks); closeOrderDrawer() }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}