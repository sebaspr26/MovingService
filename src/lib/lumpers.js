import { supabase } from './supabase'

// Lumpers hang from an order (supabase/035_order_lumpers.sql). Their truck and
// cycle are the ORDER's, read through the join, so they follow the order when it
// is reassigned or carried over to a new cycle.
//
// An unpaid lumper counts as an expense of the truck's cycle; once reimbursed
// (paid) it stops counting. It never touches the order's rate.

export const lumperAmount = l => Number(l?.amount) || 0

/** What the cycle still owes for lumpers: the unpaid ones. */
export const sumUnpaidLumpers = rows => (rows || []).reduce((s, r) => (r.paid ? s : s + lumperAmount(r)), 0)

/** Date a lumper belongs to (week filters): its receipt date, else the order's pickup. */
export const lumperDate = l => l.date || l.orders?.pu_date || ''

/**
 * Every lumper of the orders in these cycles, each with its order
 * (`orders: { cycle_id, truck_id, order_number, pu_date }`). Never throws: before
 * the migration is run the table doesn't exist, and balances must keep working.
 */
export async function fetchCycleLumpers(cycleIds) {
  if (!cycleIds?.length) return []
  const { data, error } = await supabase.from('order_lumpers')
    .select('*, orders!inner(cycle_id, truck_id, order_number, pu_date)')
    .in('orders.cycle_id', cycleIds)
    .order('created_at')
  if (error) {
    console.warn('[lumpers]', error.message)
    return []
  }
  return data || []
}

/** Lumpers of one order, oldest first. Never throws (see fetchCycleLumpers). */
export async function fetchOrderLumpers(orderId) {
  if (!orderId) return []
  const { data, error } = await supabase.from('order_lumpers').select('*').eq('order_id', orderId).order('created_at')
  if (error) {
    console.warn('[lumpers]', error.message)
    return []
  }
  return data || []
}
