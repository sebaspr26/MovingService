import { supabase } from './supabase'
import { getAllowedTruckIds } from './permissions'
import { logAudit } from './auditLog'

// Truck maintenance (supabase/039_maintenance.sql). Trucks with a type get an
// interval ("every X miles") and an optional early notice. The counter is
// computed, not stored: start_miles + loaded miles + deadhead of the truck's
// orders that ran since `counting_from`.

// Orders that actually ran (or are running); booked/assigned/canceled/TONU don't count
export const RUNNING_STATUSES = ['in_transit', 'delivered', 'invoiced', 'paid']

const num = v => Number(v) || 0

/** Counter of one truck: { total, loaded, dh, offset, remaining, level, pct, orders } */
export function summarizeMaintenance(cfg, orders) {
  const counted = (orders || [])
    .filter(o => RUNNING_STATUSES.includes(o.status) && (o.pu_date || '') >= cfg.counting_from)
    .sort((a, b) => String(a.pu_date || '').localeCompare(String(b.pu_date || '')))
  const loaded = counted.reduce((s, o) => s + num(o.miles), 0)
  const dh = counted.reduce((s, o) => s + num(o.dead_miles), 0)
  const offset = num(cfg.start_miles)
  const total = offset + loaded + dh
  const interval = num(cfg.interval_miles)
  const warn = cfg.warn_miles ? num(cfg.warn_miles) : null
  const level = interval > 0 && total >= interval ? 'critical' : (warn && total >= warn ? 'warn' : 'ok')
  return {
    total, loaded, dh, offset, interval, warn, level, orders: counted,
    remaining: interval - total,
    pct: interval > 0 ? Math.min(100, (total / interval) * 100) : 0,
  }
}

/** Identifies an alert so reading it sticks until the cycle restarts or the level changes. */
export const alertKey = (truckId, cfg, level) => `${truckId}|${cfg.counting_from}|${num(cfg.start_miles)}|${level}`

const isDriverRole = s => ['driver', 'driver_lease'].includes(s?.user?.user_metadata?.role)

/**
 * Everything the Mantenimiento page and the bell need for this user:
 * { trucks: [{ ...truck, cfg, summary, key }], untyped: [truck], reads: Set }.
 * Super admin/admin see their trucks, a driver only his own. Never throws: before
 * the migrations the typed trucks/config simply don't exist.
 */
export async function loadMaintenance(session, companyId) {
  const tq = supabase.from('trucks').select('*').order('number')
  const { data: allTrucks } = await (companyId ? tq.eq('company_id', companyId) : tq)
  let scope = allTrucks || []
  if (isDriverRole(session)) {
    const { data: me } = await supabase.from('drivers').select('truck_id').eq('email', session?.user?.email).maybeSingle()
    scope = me?.truck_id ? scope.filter(t => t.id === me.truck_id) : []
  } else {
    const allowed = getAllowedTruckIds(session)
    if (allowed) scope = scope.filter(t => allowed.includes(t.id))
  }
  const typed = scope.filter(t => t.truck_type)
  const untyped = scope.filter(t => !t.truck_type)
  if (!typed.length) return { trucks: [], untyped, reads: new Set() }

  const ids = typed.map(t => t.id)
  const [cfgRes, readsRes] = await Promise.all([
    supabase.from('truck_maintenance').select('*').in('truck_id', ids),
    supabase.from('maintenance_alert_reads').select('alert_key').eq('user_id', session?.user?.id || ''),
  ])
  if (cfgRes.error) console.warn('[maintenance]', cfgRes.error.message)
  const cfgs = Object.fromEntries((cfgRes.data || []).map(c => [c.truck_id, c]))
  const reads = new Set((readsRes.data || []).map(r => r.alert_key))

  const configured = ids.filter(id => cfgs[id])
  let ordersBy = {}
  if (configured.length) {
    const from = configured.map(id => cfgs[id].counting_from).sort()[0]
    const { data: orders } = await supabase.from('orders')
      .select('id, truck_id, order_number, pu_city, do_city, pu_date, do_date, miles, dead_miles, status')
      .in('truck_id', configured).gte('pu_date', from)
    for (const o of orders || []) (ordersBy[o.truck_id] ||= []).push(o)
  }

  const trucks = typed.map(t => {
    const cfg = cfgs[t.id] || null
    const summary = cfg ? summarizeMaintenance(cfg, ordersBy[t.id]) : null
    return { ...t, cfg, summary, key: cfg && summary ? alertKey(t.id, cfg, summary.level) : null }
  })
  return { trucks, untyped, reads }
}

/** Unread yellow/red alerts, red first. */
export function pendingAlerts({ trucks, reads }) {
  return trucks
    .filter(t => t.summary && t.summary.level !== 'ok' && !reads.has(t.key))
    .sort((a, b) => (a.summary.level === 'critical' ? 0 : 1) - (b.summary.level === 'critical' ? 0 : 1))
}

/**
 * Every yellow/red notification (read or not), each with `read`: unread first, then red
 * before yellow, then the closest to its limit. The bell shows the first 5; the
 * Notificaciones page shows them all.
 */
export function allAlerts({ trucks, reads }) {
  return trucks
    .filter(t => t.summary && t.summary.level !== 'ok')
    .map(t => ({ ...t, read: reads.has(t.key) }))
    .sort((a, b) =>
      (a.read ? 1 : 0) - (b.read ? 1 : 0)
      || (a.summary.level === 'critical' ? 0 : 1) - (b.summary.level === 'critical' ? 0 : 1)
      || b.summary.pct - a.summary.pct)
}

export async function markAlertsRead(session, keys) {
  if (!keys.length || !session?.user?.id) return
  await supabase.from('maintenance_alert_reads')
    .upsert(keys.map(k => ({ user_id: session.user.id, alert_key: k })), { onConflict: 'user_id,alert_key' })
}

/** Tells the bell and the page to reload their data. */
export const notifyMaintenanceChanged = () => window.dispatchEvent(new Event('maintenance:changed'))

export async function saveMaintenanceConfig(session, truck, { interval, warn, countingFrom, startMiles }) {
  const row = {
    truck_id: truck.id,
    interval_miles: Math.round(num(interval)),
    warn_miles: warn ? Math.round(num(warn)) : null,
    counting_from: countingFrom,
    start_miles: num(startMiles),
    updated_by_name: session?.user?.user_metadata?.name || session?.user?.email || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('truck_maintenance').upsert(row, { onConflict: 'truck_id' })
  if (error) throw error
  logAudit(session, {
    action: 'update_maintenance', entityType: 'truck', entityId: truck.id, entityName: truck.name,
    extraInfo: { interval_miles: row.interval_miles, warn_miles: row.warn_miles, counting_from: row.counting_from, start_miles: row.start_miles, was_configured: !!truck.cfg },
  })
  notifyMaintenanceChanged()
}

/** The service was done: logs it and restarts the counter from that date. */
export async function registerService(session, truck, { date, notes }) {
  const { error } = await supabase.from('maintenance_logs').insert({
    truck_id: truck.id, serviced_at: date, miles_at: truck.summary?.total ?? null, notes: notes?.trim() || null,
    created_by_email: session?.user?.email || null, created_by_name: session?.user?.user_metadata?.name || null,
  })
  if (error) throw error
  const { error: cfgErr } = await supabase.from('truck_maintenance')
    .update({ counting_from: date, start_miles: 0, updated_at: new Date().toISOString() }).eq('truck_id', truck.id)
  if (cfgErr) throw cfgErr
  logAudit(session, {
    action: 'service_maintenance', entityType: 'truck', entityId: truck.id, entityName: truck.name,
    extraInfo: { serviced_at: date, miles_at: truck.summary?.total ?? null, notes: notes?.trim() || null },
  })
  notifyMaintenanceChanged()
}

export async function fetchServiceLogs(truckId) {
  const { data } = await supabase.from('maintenance_logs').select('*').eq('truck_id', truckId).order('serviced_at', { ascending: false }).order('created_at', { ascending: false }).limit(100)
  return data || []
}

export const fmtMi = n => Math.round(Number(n) || 0).toLocaleString('en-US')

export const LEVEL_STYLES = {
  ok: { label: 'Al día', bar: 'bg-emerald-500', text: 'text-emerald-400', dot: 'bg-emerald-500', soft: 'bg-emerald-600/10 border-emerald-600/25' },
  warn: { label: 'Aviso', bar: 'bg-amber-500', text: 'text-amber-400', dot: 'bg-amber-500', soft: 'bg-amber-600/10 border-amber-600/25' },
  critical: { label: 'Mantenimiento ya', bar: 'bg-red-500', text: 'text-red-400', dot: 'bg-red-500', soft: 'bg-red-600/10 border-red-600/25' },
}

/** What a truck's notification says, e.g. "El camión de LUIS ya lleva 5,120 mi y se acerca su próximo mantenimiento". */
export function alertMessage(s, name) {
  const who = name ? `El camión de ${name}` : 'El camión'
  if (s.level === 'critical') {
    const over = -s.remaining
    return over > 0
      ? `${who} ya lleva ${fmtMi(s.total)} mi y pasó el límite de ${fmtMi(s.interval)} mi: toca mantenimiento ya`
      : `${who} llegó a las ${fmtMi(s.interval)} mi: toca mantenimiento ya`
  }
  if (s.level === 'warn') return `${who} ya lleva ${fmtMi(s.total)} mi y se acerca su próximo mantenimiento (faltan ${fmtMi(s.remaining)} mi)`
  return `${who} lleva ${fmtMi(s.total)} mi (faltan ${fmtMi(s.remaining)} mi para el mantenimiento)`
}
