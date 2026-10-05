import { supabase } from './supabase'
import { getAllowedTruckIds, getPerCompanyMeta } from './permissions'
import { advanceStatuses, saveAdvancedStatuses } from './orders'
import { loadAuthUsers } from './pageCache'

// Data for the Orders list, loaded once and kept: the next visit shows it
// right away and refreshes it in the background. Only the columns the list
// uses — select('*') also brought notes, commodity, IFTA state miles... (449
// KB for 304 orders at Dacrisam, 190 KB with these).
const LIST_COLUMNS = [
  'id', 'truck_id', 'cycle_id', 'company_id', 'order_number', 'ref_number', 'status',
  'pu_date', 'pu_city', 'do_date', 'do_city', 'miles', 'dead_miles',
  'rate', 'paid', 'apply_discount', 'discount_percent', 'dispatcher_paid', 'carried_over',
  'broker_id', 'dispatcher', 'driver_id', 'driver_name', 'created_at',
].join(', ')

const isDriverRole = s => ['driver', 'driver_lease'].includes(s?.user?.user_metadata?.role)

/** { orders, trucks, brokers: {id: broker}, paymentMap: {orderId: {...}} } */
export async function loadOrders(session, companyId) {
  const scoped = q => companyId ? q.eq('company_id', companyId) : q
  const [ordersRes, trucksRes, brokersRes, dispPayRes, drvPayRes] = await Promise.all([
    scoped(supabase.from('orders').select(LIST_COLUMNS).order('pu_date', { ascending: false })),
    scoped(supabase.from('trucks').select('id, name, number')),
    scoped(supabase.from('brokers').select('id, name, type')),
    scoped(supabase.from('dispatcher_payments').select('id, order_ids, payment_number')),
    scoped(supabase.from('driver_payments').select('id, order_ids, payment_number')),
  ])
  if (ordersRes.error) throw ordersRes.error

  const allowedIds = getAllowedTruckIds(session)
  const role = session?.user?.user_metadata?.role
  const email = session?.user?.email
  const allTrucks = trucksRes.data || []
  const trucks = allowedIds ? allTrucks.filter(t => allowedIds.includes(t.id)) : allTrucks
  const allOrders = ordersRes.data || []

  let orders
  if (isDriverRole(session) && email) {
    // Drivers: solo las órdenes de su camión asignado (skip allowedIds filter)
    const { data: me } = await supabase.from('drivers').select('truck_id').eq('email', email).maybeSingle()
    orders = me?.truck_id ? allOrders.filter(o => o.truck_id === me.truck_id) : []
  } else {
    orders = allowedIds ? allOrders.filter(o => !o.truck_id || allowedIds.includes(o.truck_id)) : allOrders
  }
  // Dispatchers: solo sus órdenes a menos que tengan permiso "ver_todas_ordenes"
  if (role === 'dispatcher' && email) {
    const canSeeAll = getPerCompanyMeta(session).permissions?.orders?.ver_todas_ordenes === true
    if (!canSeeAll) {
      const userName = (session?.user?.user_metadata?.name || '').trim().toLowerCase()
      orders = orders.filter(o => {
        if (!o.dispatcher) return false
        if (o.dispatcher === email) return true
        // también coincide por nombre mientras no se haya migrado
        return !!userName && o.dispatcher.trim().toLowerCase() === userName
      })
    }
  }

  // Statuses that moved with the dates show right away; saving them doesn't
  // hold the list
  const advanced = advanceStatuses(orders)
  saveAdvancedStatuses(advanced.updates, supabase).catch(err => console.warn('[orders] auto status', err))

  const brokers = {}
  for (const b of brokersRes.data || []) brokers[b.id] = b
  const paymentMap = {}
  for (const p of dispPayRes.data || []) {
    for (const oid of p.order_ids || []) Object.assign(paymentMap[oid] ||= {}, { dispPaid: true, dispNum: p.payment_number })
  }
  for (const p of drvPayRes.data || []) {
    for (const oid of p.order_ids || []) Object.assign(paymentMap[oid] ||= {}, { drvPaid: true, drvNum: p.payment_number })
  }
  return { orders: advanced.orders, trucks, brokers, paymentMap }
}

// ── Cache: per user and company ──
const cache = {}
const keyOf = (session, companyId) => `${session?.user?.id || ''}|${companyId || ''}`

export function getOrdersCache(session, companyId) {
  return cache[keyOf(session, companyId)] || null
}

/** Merges local changes into the cached data (keeps its age). */
export function patchOrdersCache(session, companyId, patch) {
  const entry = cache[keyOf(session, companyId)]
  if (entry?.data) entry.data = { ...entry.data, ...patch }
}

/** Loads (or joins an in-flight load) and stores the result in the cache. */
export function refreshOrders(session, companyId) {
  const key = keyOf(session, companyId)
  const entry = cache[key]
  if (entry?.pending) return entry.pending
  const pending = loadOrders(session, companyId)
    .then(data => { cache[key] = { data, ts: Date.now() }; return data })
    .catch(err => { if (cache[key]) delete cache[key].pending; throw err })
  cache[key] = { ...(entry || {}), pending }
  return pending
}

// ── Dispatcher directory (Auth users, shared and once per session) ──
const migrated = new Set()

/** [{ email, name }] of super_admin/admin/dispatcher users. */
export async function loadDispatcherDirectory() {
  const data = await loadAuthUsers()
  return (data.users || [])
    .filter(u => ['super_admin', 'admin', 'dispatcher'].includes(u.user_metadata?.role))
    .map(u => ({ email: u.email, name: u.user_metadata?.name || u.email }))
}

/**
 * Legacy orders that store the dispatcher's NAME get its email. Used to run on
 * every visit over every company's orders; now once per session and company.
 * Returns how many orders changed.
 */
export async function migrateDispatcherNames(dispatchers, companyId) {
  const key = companyId || '*'
  if (migrated.has(key)) return 0
  migrated.add(key)
  const nameToEmail = {}
  for (const d of dispatchers) if (d.name && d.name !== d.email) nameToEmail[d.name.toLowerCase()] = d.email
  let q = supabase.from('orders').select('id, dispatcher').not('dispatcher', 'is', null).neq('dispatcher', '').not('dispatcher', 'like', '%@%')
  if (companyId) q = q.eq('company_id', companyId)
  const { data } = await q
  const toMigrate = (data || []).filter(o => nameToEmail[o.dispatcher.trim().toLowerCase()])
  for (const o of toMigrate) {
    await supabase.from('orders').update({ dispatcher: nameToEmail[o.dispatcher.trim().toLowerCase()] }).eq('id', o.id)
  }
  return toMigrate.length
}
