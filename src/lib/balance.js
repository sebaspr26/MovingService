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

/**
 * Runs a write that can change a truck's balance and records it in Auditoria —
 * the same before/after pattern as OrderDetail/ExpensesTab, in one place so a
 * call site can't forget the snapshot. `write` must return a Supabase result
 * ({ data, error }); nothing is logged if it fails.
 *
 * Without truckId+cycleId the action is still logged, just without balance
 * numbers. When the write moves money OUT of another truck/cycle too (an order
 * reassigned to a different truck, or moved to another cycle), pass that one as
 * `from: { truckId, cycleId, entityName }` and it gets its own entry.
 */
export async function auditedBalanceWrite(session, audit, write) {
  const { truckId, cycleId, from } = audit
  const tracked = !!(truckId && cycleId)
  const fromTracked = !!(from?.truckId && from?.cycleId) && (from.truckId !== truckId || from.cycleId !== cycleId)
  const [balanceBefore, fromBalanceBefore] = await Promise.all([
    tracked ? computeTruckBalance(truckId, cycleId) : null,
    fromTracked ? computeTruckBalance(from.truckId, from.cycleId) : null,
  ])

  const result = await write()
  if (result?.error) return result

  if (tracked) logBalanceChange(session, { ...audit, balanceBefore })
  else logAudit(session, audit)
  if (fromTracked) {
    logBalanceChange(session, {
      ...audit,
      entityName: from.entityName ?? audit.entityName,
      truckId: from.truckId,
      cycleId: from.cycleId,
      balanceBefore: fromBalanceBefore,
      extraInfo: { ...audit.extraInfo, moved_out: true },
    })
  }
  return result
}

// Driver fields that feed leaseDriverDebit() — changing any of them can move
// the balance of the truck the driver is on (and the one he leaves)
const DRIVER_BALANCE_FIELDS = ['truck_id', 'status', 'pay_mode', 'pay_rate']

/**
 * Like auditedBalanceWrite, for a write to a driver row. Reads the driver's
 * current values itself, and if any balance-relevant field changes, logs one
 * entry per affected truck (the one he leaves and the one he joins) that has an
 * active cycle. `after` is the new values (only the keys being written);
 * `after = null` means the driver is being deleted.
 */
export async function auditedDriverWrite(session, { driverId, action = 'update_driver', after }, write) {
  const { data: before } = await supabase.from('drivers').select('name, truck_id, status, pay_mode, pay_rate').eq('id', driverId).maybeSingle()
  const next = after === null ? { truck_id: null, status: 'deleted' } : { ...before, ...after }
  const norm = (f, v) => (f === 'pay_rate' ? (v === null || v === undefined || v === '' ? null : Number(v)) : (v ?? null))
  const changes = {}
  for (const f of DRIVER_BALANCE_FIELDS) {
    const a = norm(f, before?.[f])
    const b = norm(f, next[f])
    if (a !== b) changes[f] = { from: a, to: b }
  }
  if (!before || Object.keys(changes).length === 0) return write()

  const truckIds = [...new Set([before.truck_id, next.truck_id].filter(Boolean))]
  const [{ data: trucks }, cycles] = await Promise.all([
    truckIds.length ? supabase.from('trucks').select('id, name').in('id', truckIds) : { data: [] },
    Promise.all(truckIds.map(t => getActiveCycle(t))),
  ])
  const truckName = id => (trucks || []).find(t => t.id === id)?.name || null
  if (changes.truck_id) changes.truck_id = { from: truckName(changes.truck_id.from), to: truckName(changes.truck_id.to) }
  const tracked = truckIds.map((t, i) => ({ truckId: t, cycleId: cycles[i]?.id })).filter(x => x.cycleId)
  const befores = await Promise.all(tracked.map(x => computeTruckBalance(x.truckId, x.cycleId)))

  const result = await write()
  if (result?.error) return result

  const base = { action, entityType: 'driver', entityId: driverId, extraInfo: { driver: before.name, changes } }
  if (tracked.length === 0) logAudit(session, { ...base, entityName: before.name })
  tracked.forEach((x, i) => logBalanceChange(session, { ...base, entityName: truckName(x.truckId), truckId: x.truckId, cycleId: x.cycleId, balanceBefore: befores[i] }))
  return result
}

/**
 * Logs several writes made together on ONE truck/cycle (e.g. a receipt with
 * diesel + DEF + an expense, or several receipts from one photo) as a chain:
 * each entry's before/after follows from the previous one, instead of all of
 * them showing the same "before" and jumping straight to the final balance.
 * `balanceBefore` is the truck balance captured before the first write; each
 * entry carries its own `delta` (+credit / -debit). Fire-and-forget, like
 * logBalanceChange.
 */
export async function logBalanceChain(session, { truckId, cycleId, balanceBefore, entries }) {
  try {
    const companyId = getActiveCompanyId()
    const [finalBalance, totalAfter] = await Promise.all([
      computeTruckBalance(truckId, cycleId),
      computeTotalBalance(companyId),
    ])
    // Company total before the whole batch; the batch only moved this truck
    let total = totalAfter - (finalBalance - balanceBefore)
    let running = balanceBefore
    for (const e of entries) {
      const after = running + (Number(e.delta) || 0)
      const totalNext = total + (after - running)
      await logAudit(session, {
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        entityName: e.entityName,
        extraInfo: { ...e.extraInfo, balanceBefore: running, balanceAfter: after, totalBalanceBefore: total, totalBalanceAfter: totalNext },
      })
      running = after
      total = totalNext
    }
  } catch (err) {
    console.warn('[logBalanceChain]', err)
  }
}
