import { supabase } from './supabase'
import { getAllowedTruckIds } from './permissions'
import { leaseDriverDebit } from './orders'

// Dashboard data in two waves of requests. It used to ask truck by truck
// (cycle, then 7 queries each, 3 waves in a row). From Colombia every round
// trip to Supabase is ~0.4 s, so what costs is waves, not requests: now
// trucks + drivers + cycles + driver payments go together, then one query
// per table for every displayed cycle.

const isDriverRole = s => ['driver', 'driver_lease'].includes(s?.user?.user_metadata?.role)

/** The cycle a truck card shows: its open one, else its latest closed one. */
function displayCycleOf(cycles) {
  const open = cycles.filter(c => !c.closed && c.end_date == null)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  if (open) return open
  return cycles.filter(c => c.closed)
    .sort((a, b) => String(b.end_date || '').localeCompare(String(a.end_date || '')))[0] || null
}

const sum = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
const byKey = (rows, key) => {
  const map = {}
  for (const r of rows || []) (map[r[key]] ||= []).push(r)
  return map
}

/** Balance of a truck's cycle — same math the cards always used. */
function summarize(truck, cycle, rows, leaseDriver, settledOrderIds) {
  const allOrders = rows.orders
  const truckDiscountPct = Number(truck.discount_percent) || 13
  const paidOrders = allOrders.filter(r => r.paid)
  // Neto con descuento aplicado: mismo calculo para todos los trucks (lease o no)
  const netIncome = paidOrders.reduce((s, r) => {
    const rate = Number(r.rate) || 0
    const applyDisc = r.apply_discount !== false
    const pct = Number(r.discount_percent) || truckDiscountPct
    return s + (applyDisc ? rate * (1 - pct / 100) : rate)
  }, 0)

  const pendingOrders = allOrders.filter(r => !r.paid)
  const pendingCount = pendingOrders.length
  const pendingAmount = pendingOrders.reduce((s, r) => s + (Number(r.rate) || 0), 0)

  const dieselTotal = sum(rows.diesel, 'value')
  const defTotal = sum(rows.def, 'value')
  const expenseTotal = sum(rows.expenses, 'amount')
  const acctDebit = sum(rows.accounting, 'debit')
  const acctCredit = sum(rows.accounting, 'credit')
  // LEASE: "pago al conductor" debita la parte del conductor, salvo ordenes ya
  // cubiertas por un pago registrado (esas van como gasto "Pago Chofer")
  const driverPayout = truck.is_lis ? leaseDriverDebit(paidOrders, leaseDriver, settledOrderIds) : 0

  const previousBalance = Number(cycle.previous_balance) || 0
  const totalDebito = dieselTotal + defTotal + expenseTotal + acctDebit + driverPayout
  const totalCredito = previousBalance + netIncome + acctCredit
  return { income: totalCredito, expenses: totalDebito, balance: totalCredito - totalDebito, pendingCount, pendingAmount }
}

const EMPTY = { income: 0, expenses: 0, balance: 0, pendingCount: 0, pendingAmount: 0 }

/**
 * Everything the Dashboard shows for the user/company:
 * { trucks, drivers, cycles: {truckId: cycle}, summaries: {truckId: summary} }.
 */
export async function loadDashboard(session, companyId) {
  const tq = supabase.from('trucks').select('*').order('number')
  const dq = supabase.from('drivers').select('id, name, email, truck_id, status, pay_mode, pay_rate').order('name')
  // Cycles and payments of the company's trucks come in the same wave
  const cq = supabase.from('cycles').select('*, trucks!inner(company_id)')
  const pq = supabase.from('driver_payments').select('truck_id, order_ids')
  const [{ data: allTrucks, error }, { data: allDrivers }, cyclesRes, paymentsRes] = await Promise.all([
    companyId ? tq.eq('company_id', companyId) : tq,
    companyId ? dq.eq('company_id', companyId) : dq,
    companyId ? cq.eq('trucks.company_id', companyId) : null,
    // Older payments may have no company: keep them, filtered by truck below
    companyId ? pq.or(`company_id.eq.${companyId},company_id.is.null`) : null,
  ])
  if (error) throw error

  let trucks
  if (isDriverRole(session)) {
    // Drivers only see their assigned truck (looked up by email, any company)
    const { data: me } = await supabase.from('drivers').select('truck_id').eq('email', session?.user?.email).maybeSingle()
    trucks = me?.truck_id ? (allTrucks || []).filter(t => t.id === me.truck_id) : []
  } else {
    const allowed = getAllowedTruckIds(session)
    trucks = allowed ? (allTrucks || []).filter(t => allowed.includes(t.id)) : (allTrucks || [])
  }
  const allowedIds = getAllowedTruckIds(session)
  const drivers = (allDrivers || [])
    .filter(d => !allowedIds || !d.truck_id || allowedIds.includes(d.truck_id))
    .map(({ id, name, truck_id, status }) => ({ id, name, truck_id, status }))

  if (!trucks.length) return { trucks, drivers, cycles: {}, summaries: {} }
  const truckIds = trucks.map(t => t.id)

  // Without a company (legacy) they're asked here, by truck
  const [{ data: cycleRows, error: cErr }, { data: payments }] = companyId
    ? [cyclesRes, paymentsRes]
    : await Promise.all([
      supabase.from('cycles').select('*').in('truck_id', truckIds),
      supabase.from('driver_payments').select('truck_id, order_ids').in('truck_id', truckIds),
    ])
  if (cErr) throw cErr
  // Drop the join used only to filter by company
  const cyclesByTruck = byKey((cycleRows || []).map(c => { const { trucks, ...rest } = c; void trucks; return rest }), 'truck_id')
  const cycles = {}
  for (const t of trucks) cycles[t.id] = displayCycleOf(cyclesByTruck[t.id] || [])
  const cycleIds = Object.values(cycles).filter(Boolean).map(c => c.id)

  const rowsOf = {}
  if (cycleIds.length) {
    const [orders, diesel, def, expenses, accounting] = await Promise.all([
      supabase.from('orders').select('cycle_id, id, rate, paid, apply_discount, discount_percent, dispatcher_paid').in('cycle_id', cycleIds),
      supabase.from('diesel').select('cycle_id, value').in('cycle_id', cycleIds),
      supabase.from('def').select('cycle_id, value').in('cycle_id', cycleIds),
      supabase.from('expenses').select('cycle_id, amount').in('cycle_id', cycleIds),
      supabase.from('accounting').select('cycle_id, debit, credit').in('cycle_id', cycleIds),
    ])
    for (const [key, res] of Object.entries({ orders, diesel, def, expenses, accounting })) {
      if (res.error) throw res.error
      rowsOf[key] = byKey(res.data, 'cycle_id')
    }
  }

  const paymentsByTruck = byKey(payments, 'truck_id')
  const summaries = {}
  for (const t of trucks) {
    const cycle = cycles[t.id]
    if (!cycle) { summaries[t.id] = EMPTY; continue }
    const rows = Object.fromEntries(['orders', 'diesel', 'def', 'expenses', 'accounting'].map(k => [k, rowsOf[k]?.[cycle.id] || []]))
    const leaseDriver = (allDrivers || []).find(d => d.truck_id === t.id && d.status === 'active') || null
    const settled = new Set((paymentsByTruck[t.id] || []).flatMap(p => p.order_ids || []))
    summaries[t.id] = summarize(t, cycle, rows, leaseDriver && { pay_mode: leaseDriver.pay_mode, pay_rate: leaseDriver.pay_rate }, settled)
  }
  return { trucks, drivers, cycles, summaries }
}

// ── Cache: show the last data right away, refresh in the background ──
const cache = {}
const keyOf = (session, companyId) => `${session?.user?.id || ''}|${companyId || ''}`

export function getDashboardCache(session, companyId) {
  return cache[keyOf(session, companyId)] || null
}

/** Loads (or joins an in-flight load) and stores the result in the cache. */
export function refreshDashboard(session, companyId) {
  const key = keyOf(session, companyId)
  const entry = cache[key]
  if (entry?.pending) return entry.pending
  const pending = loadDashboard(session, companyId)
    .then(data => { cache[key] = { data, ts: Date.now() }; return data })
    .catch(err => { if (cache[key]) delete cache[key].pending; throw err })
  cache[key] = { ...(entry || {}), pending }
  return pending
}
