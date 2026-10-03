import { supabase } from './supabase'
import { calculateTruckRoute } from './here'

// Deadhead (DH) = empty miles from the truck's previous delivery to this
// order's first pickup. One implementation for every screen: it used to be
// computed only when a truck was picked in OrderDetail (often before the RC
// was scanned, so with no pickup yet -> cleared), never for quick-add orders,
// and fell back to the truck's LATEST delivery even when it was after this
// pickup, giving a DH from the wrong place.

/**
 * The truck's most recent delivery on or before `pickupDate` (canceled/TONU
 * loads didn't move the truck). null if there is none — never a later one.
 */
export async function findPreviousDelivery(truckId, pickupDate, excludeOrderId) {
  if (!truckId || !pickupDate) return null
  let q = supabase.from('orders')
    .select('id, order_number, do_city, do_date, pu_date, status, created_at')
    .eq('truck_id', truckId)
    .not('do_city', 'is', null).neq('do_city', '')
    .not('do_date', 'is', null)
    .lte('do_date', pickupDate)
    .lte('pu_date', pickupDate)
    .order('do_date', { ascending: false })
    .order('pu_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10)
  if (excludeOrderId) q = q.neq('id', excludeOrderId)
  const { data } = await q
  return (data || []).find(o => !['canceled', 'tonu'].includes(o.status)) || null
}

/**
 * { miles, durationMinutes, from, prevOrderNumber } or null when there is no
 * previous delivery / the route can't be resolved.
 */
export async function computeDeadhead({ truckId, pickupDate, pickupPlace, excludeOrderId }) {
  if (!truckId || !pickupDate || !pickupPlace) return null
  const prev = await findPreviousDelivery(truckId, pickupDate, excludeOrderId)
  if (!prev) return null
  const route = await calculateTruckRoute(prev.do_city, pickupPlace)
  if (!route) return null
  return {
    miles: route.distanceMiles,
    durationMinutes: route.durationMinutes,
    from: prev.do_city,
    prevOrderNumber: prev.order_number,
  }
}

/** First pickup of an order: from its stops, else its PU city. */
export function firstPickupPlace(stops, puCity) {
  const p = (stops || []).filter(s => s.type === 'pickup' && (s.city || s.address))
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))[0]
  if (p) return p.address || [p.city, p.state].filter(Boolean).join(', ')
  return puCity || ''
}

/**
 * A truck's DH depends on its previous delivery, so creating, editing or
 * deleting an order changes the DH of the truck's NEXT order(s). DH was only
 * computed when an order was created, so an order registered late (or moved
 * to another date/truck) left the following order with a DH from the wrong
 * place — 24 of 27 absurd DHs found in Oct 2026 were this.
 *
 * Recomputes the DH of the next `count` orders of `truckId` picked up on or
 * after `fromDate`, writes the ones that changed and logs them in Auditoría.
 * Fire-and-forget: never throws.
 */
export async function refreshFollowingDeadheads({ truckId, fromDate, excludeOrderId, session, count = 2 }) {
  if (!truckId || !fromDate) return
  try {
    const { logAudit } = await import('./auditLog')
    let q = supabase.from('orders')
      .select('id, order_number, pu_date, pu_city, dead_miles, status')
      .eq('truck_id', truckId).gte('pu_date', fromDate)
      .order('pu_date').order('created_at').limit(count + 3)
    if (excludeOrderId) q = q.neq('id', excludeOrderId)
    const { data } = await q
    const next = (data || []).filter(o => o.pu_city && !['canceled', 'tonu'].includes(o.status)).slice(0, count)
    for (const o of next) {
      const dh = await computeDeadhead({ truckId, pickupDate: o.pu_date, pickupPlace: o.pu_city, excludeOrderId: o.id })
      const miles = dh ? dh.miles : 0
      const before = Number(o.dead_miles) || 0
      if (Math.abs(miles - before) < 1) continue
      const { error } = await supabase.from('orders').update({ dead_miles: miles }).eq('id', o.id)
      if (error) continue
      logAudit(session, {
        action: 'update_order', entityType: 'order', entityId: o.id, entityName: o.order_number,
        extraInfo: {
          changes: { dead_miles: { from: before, to: miles } },
          reason: dh ? `DH recalculado: la entrega anterior del camión ahora es ${dh.from} (orden #${dh.prevOrderNumber})` : 'DH recalculado: el camión no tiene entrega anterior',
        },
      })
    }
  } catch (err) {
    console.warn('[refreshFollowingDeadheads]', err)
  }
}
