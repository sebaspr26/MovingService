import { supabase } from './supabase'
import { computeTruckBalance, logBalanceChange, auditedDriverWrite } from './balance'

// What to do with a driver's row in `drivers` when his login account is deleted in
// Perfiles. Without this the "test" driver kept showing in Conductores and in Pago
// Conductores forever. A driver with ORDERS can't be removed (orders.driver_id points to
// it and his history must stay), so he is only made inactive and taken off his truck.
// One with only PAYMENTS is kept the same way unless the admin also deletes that history.

const likeEscape = s => String(s).replace(/[\\%_]/g, m => '\\' + m)

/** Driver rows of this email with how much hangs from each: [{ id, name, truck_id, is_lease, orders, payments }]. */
export async function inspectDriverRecords(email) {
  if (!email) return []
  const { data: rows } = await supabase.from('drivers').select('id, name, truck_id, is_lease, status').ilike('email', likeEscape(email))
  return Promise.all((rows || []).map(async d => {
    const [o, p] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('driver_id', d.id),
      supabase.from('driver_payments').select('*', { count: 'exact', head: true }).eq('driver_id', d.id),
    ])
    return { ...d, orders: o.count || 0, payments: p.count || 0 }
  }))
}

/** Same as inspectDriverRecords, for one driver row (Compañía > Choferes). */
export async function inspectDriverById(id) {
  const { data: d } = await supabase.from('drivers').select('id, name, truck_id, is_lease, status').eq('id', id).maybeSingle()
  if (!d) return null
  const [o, p] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('driver_id', d.id),
    supabase.from('driver_payments').select('*', { count: 'exact', head: true }).eq('driver_id', d.id),
  ])
  return { ...d, orders: o.count || 0, payments: p.count || 0 }
}

/** A driver payment with the expense it created (and the lease checkbox it set), audited like the payment screen does it. */
export async function deleteDriverPayment({ session, payment, driverIsLease }) {
  const [{ data: truck }, { data: cycle }] = await Promise.all([
    payment.truck_id ? supabase.from('trucks').select('name, number, is_lis').eq('id', payment.truck_id).maybeSingle() : { data: null },
    payment.truck_id ? supabase.from('cycles').select('id').eq('truck_id', payment.truck_id).eq('closed', false).maybeSingle() : { data: null },
  ])
  const cycleId = cycle?.id || null
  const balanceBefore = payment.truck_id && cycleId ? await computeTruckBalance(payment.truck_id, cycleId) : null
  const { data: deletedExpense } = await supabase.from('expenses').select('id, description, amount').eq('source_payment_id', payment.id).maybeSingle()
  await supabase.from('expenses').delete().eq('source_payment_id', payment.id)
  if ((driverIsLease || truck?.is_lis) && (payment.order_ids || []).length > 0) {
    await supabase.from('orders').update({ dispatcher_paid: false }).in('id', payment.order_ids)
  }
  await supabase.from('driver_payments').delete().eq('id', payment.id)
  if (deletedExpense && balanceBefore != null) {
    logBalanceChange(session, {
      action: 'delete_expense', entityType: 'expense', entityId: deletedExpense.id,
      entityName: truck ? `${truck.name} #${truck.number}` : '', truckId: payment.truck_id, cycleId, balanceBefore,
      extraInfo: { amount: deletedExpense.amount, description: deletedExpense.description, category: 'Pago Chofer' },
    })
  }
}

/** Returns { deleted, deactivated } (counts of driver rows). */
export async function removeDriverRecords(session, records, { deleteHistory = false } = {}) {
  let deleted = 0, deactivated = 0
  for (const r of records) {
    const keepAsInactive = r.orders > 0 || (r.payments > 0 && !deleteHistory)
    if (keepAsInactive) {
      const res = await auditedDriverWrite(session, { driverId: r.id, after: { status: 'inactive', truck_id: null } },
        () => supabase.from('drivers').update({ status: 'inactive', truck_id: null }).eq('id', r.id))
      if (res?.error) throw res.error
      deactivated++
      continue
    }
    if (r.payments > 0) {
      const { data: payments } = await supabase.from('driver_payments').select('*').eq('driver_id', r.id)
      for (const payment of payments || []) await deleteDriverPayment({ session, payment, driverIsLease: r.is_lease })
    }
    const res = await auditedDriverWrite(session, { driverId: r.id, action: 'delete_driver', after: null },
      () => supabase.from('drivers').delete().eq('id', r.id))
    if (res?.error) throw res.error
    deleted++
  }
  return { deleted, deactivated }
}
