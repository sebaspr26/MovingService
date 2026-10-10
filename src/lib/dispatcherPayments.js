import { supabase } from './supabase'
import { computeTruckBalance, logBalanceChange } from './balance'
import { getActiveCompanyId } from './company'
import { htmlToPdfBase64 } from './pdf'

// Dispatcher payments, shared by the per-dispatcher modal and the union modal.
// One payment = one dispatcher_payments row + one "Pago Dispatcher" expense per
// truck/cycle of its loads (a dispatcher can work loads of several trucks).

const nameOf = user => user.user_metadata?.name || user.email || ''

/** Commission % in the dispatcher's profile for the current month (else the latest one). */
export function dispatcherProfileRate(user, cId = getActiveCompanyId()) {
  const meta = user.user_metadata || {}
  const companyMeta = (cId && meta.company_settings?.[cId]) || {}
  const rates = (companyMeta.dispatcher_rates?.length ? companyMeta.dispatcher_rates : null)
    || (meta.dispatcher_rates?.length ? meta.dispatcher_rates : null)
    || []
  const currentMonth = new Date().toISOString().slice(0, 7)
  return (rates.find(r => r.month === currentMonth) || rates[rates.length - 1])?.pct || 0
}

/**
 * Registers a payment to ONE dispatcher for `orders` at `commissionPct`, reflects
 * it as expenses in Gastos and records it in Auditoria. `union` ({ id, group }) marks
 * it as part of a union payment. Returns the payment, or null if it failed (the
 * error is already toasted).
 */
export async function createDispatcherPayment({ session, toast, user, orders, commissionPct, paymentNumber, union }) {
  const cId = getActiveCompanyId()
  const dispatcherEmail = user.email || ''
  const dispatcherName = nameOf(user)
  const gross = orders.reduce((s, o) => s + (Number(o.rate) || 0), 0)
  const payout = gross * commissionPct / 100
  const today = new Date().toISOString().split('T')[0]
  const sorted = [...orders].sort((a, b) => (a.pu_date || '') < (b.pu_date || '') ? -1 : 1)
  const periodStart = sorted[0]?.pu_date || today
  const periodEnd = sorted[sorted.length - 1]?.do_date || sorted[sorted.length - 1]?.pu_date || today

  const { data: newPayment, error } = await supabase.from('dispatcher_payments').insert({
    dispatcher_email: dispatcherEmail,
    dispatcher_name: dispatcherName,
    gross_revenue: gross,
    commission_pct: commissionPct,
    payout,
    pay_date: today,
    period_start: periodStart,
    period_end: periodEnd,
    order_ids: orders.map(o => o.id),
    payment_number: paymentNumber,
    company_id: cId,
    ...(union && { union_id: union.id, union_group: union.group }),
  }).select().single()

  if (error) { toast.error('Error: ' + error.message); return null }

  // Reflejar el pago como gasto en cada truck/ciclo correspondiente — un dispatcher
  // puede despachar cargas de varios choferes/trucks, no se mezcla en uno solo
  const byTruckCycle = {}
  orders.forEach(o => {
    if (!o.truck_id || !o.cycle_id) return
    const key = `${o.truck_id}|${o.cycle_id}`
    const commission = (Number(o.rate) || 0) * commissionPct / 100
    if (!byTruckCycle[key]) byTruckCycle[key] = { truck_id: o.truck_id, cycle_id: o.cycle_id, amount: 0 }
    byTruckCycle[key].amount += commission
  })
  const groups = Object.values(byTruckCycle)
  // Balance de cada camion involucrado ANTES de insertar los gastos, para poder
  // mostrar el antes/despues en Auditoria (ver lib/balance.js)
  const balancesBefore = await Promise.all(groups.map(g => computeTruckBalance(g.truck_id, g.cycle_id)))
  const expenseRows = groups.map(g => ({
    truck_id: g.truck_id,
    cycle_id: g.cycle_id,
    category: 'Pago Dispatcher',
    invoice_number: `#${newPayment.payment_number}`,
    description: `Settlement ${dispatcherName} #${newPayment.payment_number}`,
    amount: g.amount,
    date: today,
    period_start: periodStart,
    period_end: periodEnd,
    source_payment_type: 'dispatcher',
    source_payment_id: newPayment.id,
    created_by_email: session?.user?.email || null,
    created_by_name: session?.user?.user_metadata?.name || null,
  }))
  if (expenseRows.length > 0) {
    const { data: insertedExpenses, error: expError } = await supabase.from('expenses').insert(expenseRows).select()
    if (expError) {
      toast.error('El pago se guardo pero NO se registro en Gastos: ' + expError.message)
    } else {
      const { data: trucksData } = await supabase.from('trucks').select('id, name, number').in('id', groups.map(g => g.truck_id))
      const truckNameById = Object.fromEntries((trucksData || []).map(t => [t.id, `${t.name} #${t.number}`]))
      ;(insertedExpenses || []).forEach((exp, i) => {
        logBalanceChange(session, {
          action: 'create_expense',
          entityType: 'expense',
          entityId: exp.id,
          entityName: truckNameById[exp.truck_id] || '',
          truckId: exp.truck_id,
          cycleId: exp.cycle_id,
          balanceBefore: balancesBefore[i],
          extraInfo: { amount: exp.amount, description: exp.description, category: 'Pago Dispatcher' },
        })
      })
    }
  }
  return newPayment
}

/** Deletes a payment together with the expenses it created, auditing the balance change. */
export async function deleteDispatcherPayment({ session, payment }) {
  const { data: deletedExpenses } = await supabase.from('expenses').select('id, truck_id, cycle_id, description, amount').eq('source_payment_id', payment.id)
  const balancesBefore = await Promise.all((deletedExpenses || []).map(e => computeTruckBalance(e.truck_id, e.cycle_id)))
  const { data: trucksData } = await supabase.from('trucks').select('id, name, number').in('id', (deletedExpenses || []).map(e => e.truck_id))
  const truckNameById = Object.fromEntries((trucksData || []).map(t => [t.id, `${t.name} #${t.number}`]))
  await supabase.from('expenses').delete().eq('source_payment_id', payment.id)
  await supabase.from('dispatcher_payments').delete().eq('id', payment.id)
  ;(deletedExpenses || []).forEach((exp, i) => {
    logBalanceChange(session, {
      action: 'delete_expense',
      entityType: 'expense',
      entityId: exp.id,
      entityName: truckNameById[exp.truck_id] || '',
      truckId: exp.truck_id,
      cycleId: exp.cycle_id,
      balanceBefore: balancesBefore[i],
      extraInfo: { amount: exp.amount, description: exp.description, category: 'Pago Dispatcher' },
    })
  })
}

// ── Settlement document (the "invoice" each dispatcher receives) ──

async function settlementBody(payment, user) {
  const { data: orders } = await supabase.from('orders')
    .select('id, order_number, pu_city, do_city, pu_date, do_date, rate, miles, dead_miles')
    .in('id', payment.order_ids || [])
  return {
    paymentNumber: payment.payment_number,
    dispatcherEmail: user.email || '',
    dispatcherName: nameOf(user),
    gross: payment.gross_revenue,
    commissionPct: payment.commission_pct,
    payout: payment.payout,
    payDate: payment.pay_date,
    periodStart: payment.period_start,
    periodEnd: payment.period_end,
    orders: orders || [],
    companyId: getActiveCompanyId(),
  }
}

async function postSettlement(body) {
  const res = await fetch('/api/send-settlement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Error')
  return data
}

/** Builds the dispatcher's settlement for one payment, emails it as a PDF and marks it as sent. */
export async function emailSettlement(payment, user) {
  const body = await settlementBody(payment, user)
  const preview = await postSettlement({ ...body, action: 'preview', type: 'dispatcher' })
  if (!preview.html) throw new Error('Error generando documento')
  const pdfBase64 = await htmlToPdfBase64(preview.html, { containerWidth: 880 })
  await postSettlement({ ...body, pdfBase64 })
  await supabase.from('dispatcher_payments').update({ email_sent_at: new Date().toISOString() }).eq('id', payment.id)
}
