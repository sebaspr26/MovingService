import { supabase } from './supabase'
import { getActiveCycle, getLatestClosedCycle } from './cycles'
import { leaseDriverDebit } from './orders'
import { logAudit } from './auditLog'
import { getActiveCompanyId } from './company'

// Same formula as TruckView.jsx/Dashboard.jsx (credito - debito), as a plain
// function usable outside a React component. Costs ~6 parallel queries.
export async function computeTruckBalance(truckId, cycleId) {
  if (!truckId || !cycleId) return 0
  const [truckRes, cycleRes, paidOrders, diesel, def, expenses, accounting, leaseDriver, driverPayments] = await Promise.all([
    supabase.from('trucks').select('is_lis, discount_percent').eq('id', truckId).single(),
    supabase.from('cycles').select('previous_balance').eq('id', cycleId).single(),
    supabase.from('orders').select('id, rate, apply_discount, discount_percent, dispatcher_paid')
      .eq('truck_id', truckId).eq('cycle_id', cycleId).eq('paid', true),
    supabase.from('diesel').select('value').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('def').select('value').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('expenses').select('amount').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('accounting').select('debit, credit').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('drivers').select('pay_mode, pay_rate').eq('truck_id', truckId).eq('status', 'active').limit(1).maybeSingle(),
    supabase.from('driver_payments').select('order_ids').eq('truck_id', truckId),
  ])

  const discountPct = Number(truckRes.data?.discount_percent) || 13
  const previousBalance = Number(cycleRes.data?.previous_balance) || 0
  const paidRows = paidOrders.data || []

  const netIncome = paidRows.reduce((s, r) => {
    const rate = Number(r.rate) || 0
    const applyDisc = r.apply_discount !== false
    const pct = Number(r.discount_percent) || discountPct
    return s + (applyDisc ? rate * (1 - pct / 100) : rate)
  }, 0)

  const dieselTotal = (diesel.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0)
  const defTotal = (def.data || []).reduce((s, r) => s + (Number(r.value) || 0), 0)
  const expenseTotal = (expenses.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const acctDebit = (accounting.data || []).reduce((s, r) => s + (Number(r.debit) || 0), 0)
  const acctCredit = (accounting.data || []).reduce((s, r) => s + (Number(r.credit) || 0), 0)
  const settledOrderIds = new Set((driverPayments.data || []).flatMap(p => p.order_ids || []))
  const driverPayout = truckRes.data?.is_lis ? leaseDriverDebit(paidRows, leaseDriver.data, settledOrderIds) : 0

  const totalDebito = dieselTotal + defTotal + expenseTotal + acctDebit + driverPayout
  const totalCredito = previousBalance + netIncome + acctCredit
  return totalCredito - totalDebito
}

// Sum of computeTruckBalance() across every truck of the company, each using its
// active cycle (or latest closed one if none is active) — mirrors Dashboard.jsx's
// "Balance Total". Expensive (N trucks x ~6 queries) — only call this once per
// action, never twice, and never await it from a user-facing save flow.
export async function computeTotalBalance(companyId) {
  const q = supabase.from('trucks').select('id')
  const { data: trucks } = companyId ? await q.eq('company_id', companyId) : await q
  if (!trucks || trucks.length === 0) return 0
  const balances = await Promise.all(trucks.map(async (t) => {
    const cycle = (await getActiveCycle(t.id)) || (await getLatestClosedCycle(t.id))
    if (!cycle) return 0
    return computeTruckBalance(t.id, cycle.id)
  }))
  return balances.reduce((s, b) => s + b, 0)
}

/**
 * Logs an audit entry with individual truck + company-wide balance before/after.
 * `balanceBefore` must be captured by the caller BEFORE the DB write (via
 * computeTruckBalance) so it reflects the true prior state. This function itself
 * should be called WITHOUT awaiting it (fire-and-forget) after the write succeeds
 * and the user already sees their save confirmed — computeTotalBalance is the
 * expensive part and must never block the user-facing save flow.
 */
export async function logBalanceChange(session, { action, entityType, entityId, entityName, truckId, cycleId, balanceBefore, extraInfo }) {
  try {
    const companyId = getActiveCompanyId()
    const balanceAfter = await computeTruckBalance(truckId, cycleId)
    const totalAfter = await computeTotalBalance(companyId)
    const totalBefore = totalAfter - (balanceAfter - balanceBefore)
    await logAudit(session, {
      action,
      entityType,
      entityId,
      entityName,
      extraInfo: {
        ...extraInfo,
        balanceBefore,
        balanceAfter,
        totalBalanceBefore: totalBefore,
        totalBalanceAfter: totalAfter,
      },
    })
  } catch (err) {
    console.warn('[logBalanceChange]', err)
  }
}
