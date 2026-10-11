import { supabase } from './supabase'
import { getActiveCompanyId } from './company'
import { canAccess, isSuperAdmin, getAllowedTruckIds } from './permissions'
import { readPageCache, writePageCache, loadAuthUsers } from './pageCache'
import { loadUnions } from './dispatcherUnions'
import { refreshMaintenance } from './maintenance'

// Warms the page cache of the other sections right after the app opens (Dashboard and
// Orders already had it), so each one opens with data on screen instead of a spinner.
// Every loader here writes the SAME shape its section keeps (see the section's
// usePageCacheSave), and the section still refreshes in the background when opened.
// Mantenimiento/Notificaciones are warmed by the bell (lib/maintenance.js).

const byId = rows => Object.fromEntries((rows || []).map(r => [r.id, r]))
const scoped = (q, cId) => (cId ? q.eq('company_id', cId) : q)

// Conductores (DispatcherDrivers): drivers + trucks + documents
async function loadConductores(session) {
  const cId = getActiveCompanyId()
  const role = session?.user?.user_metadata?.role
  const isAdmin = isSuperAdmin(session) || role === 'admin'
  let allowed = null
  if (!isAdmin) {
    const fromPerms = getAllowedTruckIds(session)
    if (fromPerms && fromPerms.length > 0) allowed = fromPerms
    else {
      const { data: orders } = await scoped(supabase.from('orders').select('truck_id').eq('dispatcher', session.user.email).not('truck_id', 'is', null), cId)
      allowed = [...new Set((orders || []).map(o => o.truck_id))]
    }
  }
  const trucksQ = () => {
    if (allowed === null) return scoped(supabase.from('trucks').select('id, name, number, vin_number').order('name'), cId)
    if (!allowed.length) return Promise.resolve({ data: [] })
    return supabase.from('trucks').select('id, name, number, vin_number').in('id', allowed).order('name')
  }
  const driversQ = () => {
    if (allowed === null) return scoped(supabase.from('drivers').select('*').eq('status', 'active').order('name'), cId)
    if (!allowed.length) return Promise.resolve({ data: [] })
    return scoped(supabase.from('drivers').select('*').in('truck_id', allowed).eq('status', 'active').order('name'), cId)
  }
  const [{ data: trucksRows }, { data: driversRows }] = await Promise.all([trucksQ(), driversQ()])
  const trucks = trucksRows || []
  const drivers = driversRows || []
  let driverDocs = {}, truckDocs = {}
  if (drivers.length || trucks.length) {
    const [{ data: dd }, { data: td }] = await Promise.all([
      drivers.length ? supabase.from('driver_documents').select('*').in('driver_id', drivers.map(d => d.id)) : { data: [] },
      trucks.length ? supabase.from('truck_documents').select('*').in('truck_id', trucks.map(t => t.id)) : { data: [] },
    ])
    for (const d of dd || []) (driverDocs[d.driver_id] ||= []).push(d)
    for (const d of td || []) (truckDocs[d.truck_id] ||= []).push(d)
  }
  return { drivers, trucks: byId(trucks), driverDocs, truckDocs }
}

// Compañía > Choferes / Camiones
async function loadCompanyDrivers() {
  const cId = getActiveCompanyId()
  const [{ data: drivers }, { data: trucks }] = await Promise.all([
    scoped(supabase.from('drivers').select('*').order('name'), cId),
    scoped(supabase.from('trucks').select('id, name, number').order('number'), cId),
  ])
  return { drivers: drivers || [], trucks: trucks || [] }
}
async function loadCompanyTrucks() {
  const { data } = await scoped(supabase.from('trucks').select('*').order('number'), getActiveCompanyId())
  return { trucks: data || [] }
}

// Pago Conductores
async function loadPagoConductores() {
  const cId = getActiveCompanyId()
  const [{ data: drivers }, { data: trucks }, auth] = await Promise.all([
    scoped(supabase.from('drivers').select('*').order('name'), cId),
    scoped(supabase.from('trucks').select('id, name, number, vin_number, is_lis').order('name'), cId),
    loadAuthUsers().catch(() => ({ users: [] })),
  ])
  const avatarMap = {}, roleMap = {}
  for (const u of auth.users || []) {
    const path = u.user_metadata?.avatar_path
    if (!u.email) continue
    if (path) avatarMap[u.email.toLowerCase()] = supabase.storage.from('company-docs').getPublicUrl(path).data?.publicUrl
    roleMap[u.email.toLowerCase()] = u.user_metadata?.role
  }
  return { drivers: drivers || [], trucks: byId(trucks), avatarMap, roleMap }
}

// Pago Dispatchers
async function loadPagoDispatchers(session) {
  const cId = getActiveCompanyId()
  const [data, { data: orders }, unions] = await Promise.all([
    loadAuthUsers(),
    scoped(supabase.from('orders').select('dispatcher').not('dispatcher', 'is', null).neq('dispatcher', ''), cId),
    loadUnions(cId),
  ])
  const allUsers = (data.users || []).filter(u => ['dispatcher', 'admin', 'super_admin'].includes(u.user_metadata?.role))
  const fromOrders = [...new Set((orders || []).map(o => o.dispatcher?.trim()).filter(Boolean))]
  const authUsers = allUsers.filter(u => {
    if (!u.email) return false
    if (!cId) return true
    const ac = u.user_metadata?.allowed_companies
    return Array.isArray(ac) && ac.length > 0 && ac.includes(cId)
  })
  const authEmails = new Set(authUsers.map(u => u.email?.toLowerCase()))
  const legacy = fromOrders.filter(d => !authEmails.has(d.toLowerCase())).map(d => ({ id: `legacy_${d}`, email: d, isLegacy: true }))
  const visible = isSuperAdmin(session) ? authUsers : authUsers.filter(u => u.user_metadata?.role !== 'super_admin')
  return { dispatchers: [...visible, ...legacy], unions }
}

// Historial de Pagos (what a dispatcher/driver sees of his own payments)
async function loadPaymentHistory(session) {
  const email = session?.user?.email
  if (!email) return null
  const cId = getActiveCompanyId()
  const isDriver = ['driver', 'driver_lease'].includes(session.user.user_metadata?.role)
  const table = isDriver ? 'driver_payments' : 'dispatcher_payments'
  const { data } = await scoped(supabase.from(table).select('*').eq(isDriver ? 'driver_email' : 'dispatcher_email', email).order('pay_date', { ascending: false }), cId)
  return { payments: (data || []).map(p => ({ ...p, type: isDriver ? 'driver' : 'dispatcher' })) }
}

// Estadísticas: the two blocks that read every order of the company
async function loadCityStats() {
  const { data } = await scoped(supabase.from('orders').select('pu_city, do_city').not('status', 'eq', 'canceled'), getActiveCompanyId())
  return { orders: data || [] }
}
async function loadRateStats() {
  const { data } = await scoped(supabase.from('orders').select('rate, miles, pu_city, do_city')
    .not('rate', 'is', null).not('miles', 'is', null).gt('rate', 0).gt('miles', 0), getActiveCompanyId())
  return data?.length ? { data } : null
}

// Perfiles (super admin): READ-ONLY copy of what the page loads. The page itself also
// syncs Auth drivers into the drivers table and migrates dispatcher names; that stays
// there (it runs when the page opens and refreshes the list), preloading never writes.
const ROLE_ORDER = { super_admin: 0, admin: 1, dispatcher: 2, driver: 3, driver_lease: 4 }
async function loadProfiles() {
  const cId = getActiveCompanyId()
  const [auth, { data: dbDrivers }, { data: dbTrucks }, { data: orders }] = await Promise.all([
    loadAuthUsers(),
    scoped(supabase.from('drivers').select('*').order('name'), cId),
    scoped(supabase.from('trucks').select('id, name, number, is_lis').order('number'), cId),
    scoped(supabase.from('orders').select('dispatcher').not('dispatcher', 'is', null).neq('dispatcher', ''), cId),
  ])
  const sorted = [...(auth.users || [])]
    .sort((a, b) => (ROLE_ORDER[a.user_metadata?.role] ?? 99) - (ROLE_ORDER[b.user_metadata?.role] ?? 99))
    .filter(u => {
      if (!cId || u.user_metadata?.role === 'super_admin') return true
      const ac = u.user_metadata?.allowed_companies
      return Array.isArray(ac) && ac.length > 0 && ac.includes(cId)
    })
  const nameToEmail = {}
  sorted.forEach(u => {
    const name = (u.user_metadata?.name || '').trim().toLowerCase()
    if (name && u.email) nameToEmail[name] = u.email
  })
  const dispatchers = [...new Set((orders || []).map(o => o.dispatcher).filter(Boolean))]
    .map(d => (!d.includes('@') && nameToEmail[d.trim().toLowerCase()]) ? nameToEmail[d.trim().toLowerCase()] : d)
  return { users: sorted, dbDrivers: dbDrivers || [], dbDispatchers: [...new Set(dispatchers)].sort(), dbTrucks: dbTrucks || [] }
}

// Auditoría (super admin): the unfiltered first page, the filter options and the names
const AUDIT_PAGE = 50
async function loadAuditoria() {
  const cId = getActiveCompanyId()
  const [{ data: rows }, { data: all }, auth] = await Promise.all([
    scoped(supabase.from('audit_log').select('*').order('created_at', { ascending: false }).range(0, AUDIT_PAGE - 1), cId),
    scoped(supabase.from('audit_log').select('entity_type, entity_name, user_name, user_email'), cId),
    loadAuthUsers().catch(() => ({ users: [] })),
  ])
  const list = all || []
  const trucks = [...new Set(list.filter(r => r.entity_type !== 'order').map(r => r.entity_name).filter(Boolean))].sort()
  const userMap = new Map()
  list.forEach(r => {
    const key = r.user_email || r.user_name
    if (key && !userMap.has(key)) userMap.set(key, r.user_name || r.user_email)
  })
  const dispatcherNames = {}
  ;(auth.users || []).forEach(u => { dispatcherNames[u.email] = u.user_metadata?.name || u.email })
  return {
    rows: rows || [],
    truckOptions: trucks.map(t => ({ value: t, label: t })),
    userOptions: [...userMap.keys()].map(u => ({ value: u, label: userMap.get(u) || u })),
    dispatcherNames,
  }
}

/**
 * Warms every section this user can open, one after another (so the first screens
 * the user actually opens aren't competing with a burst of requests). Skips the ones
 * already cached; a failure never matters, the section just loads when opened.
 */
export async function preloadSections(session) {
  const jobs = []
  const add = (name, allowed, load) => { if (allowed && !readPageCache(name, session)) jobs.push([name, load]) }
  add('conductores', canAccess(session, 'conductores'), () => loadConductores(session))
  add('pago-conductores', canAccess(session, 'pagos', 'pago_conductores'), loadPagoConductores)
  add('pago-dispatchers', canAccess(session, 'pagos', 'pago_dispatchers'), () => loadPagoDispatchers(session))
  add('company-drivers', canAccess(session, 'company'), loadCompanyDrivers)
  add('company-trucks', canAccess(session, 'company'), loadCompanyTrucks)
  add('payment-history', !isSuperAdmin(session), () => loadPaymentHistory(session))
  add('profiles', isSuperAdmin(session), loadProfiles)
  add('auditoria', canAccess(session, 'reportes', 'auditoria'), loadAuditoria)
  add('city-stats', canAccess(session, 'statistics'), loadCityStats)
  add('rate-stats', canAccess(session, 'statistics'), loadRateStats)
  // Mantenimiento / Notificaciones (shared with the bell, which may have started it already)
  if (canAccess(session, 'mantenimiento')) refreshMaintenance(session, getActiveCompanyId()).catch(() => {})
  for (const [name, load] of jobs) {
    try {
      const data = await load()
      if (data && !readPageCache(name, session)) writePageCache(name, session, data)
    } catch { /* the section loads it when opened */ }
  }
}
