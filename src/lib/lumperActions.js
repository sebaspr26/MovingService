import { supabase } from './supabase'
import { computeTruckBalance, logBalanceChain } from './balance'
import { logAudit } from './auditLog'
import { uploadReceipt } from './receipts'
import { fetchOrderLumpers, lumperAmount } from './lumpers'

// Writes on order_lumpers. Every one of them can move the truck's balance (an
// unpaid lumper is an expense of its cycle), so each is recorded in Auditoria with
// the truck/company balance before and after.
//
// ctx = { orderId, orderNumber, truckId, cycleId, truckName } — the order the
// lumpers hang from. Without truck+cycle the action is logged without balances.

const fmtMoney = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const tracked = ctx => !!(ctx.truckId && ctx.cycleId)

const balanceOf = ctx => (tracked(ctx) ? computeTruckBalance(ctx.truckId, ctx.cycleId) : null)

function infoOf(l, ctx, extra) {
  return {
    amount: lumperAmount(l), vendor: l.vendor || null, receipt_number: l.receipt_number || null,
    order_number: ctx.orderNumber || null, truck: ctx.truckName || null, ...extra,
  }
}

// entries: [{ action, entityId, delta, extraInfo }] — `delta` is how much each one
// moved the balance (+ credit / − debit)
function audit(session, ctx, balanceBefore, entries) {
  if (!entries.length) return
  const base = { entityType: 'lumper', entityName: ctx.truckName || ctx.orderNumber || '' }
  if (tracked(ctx) && balanceBefore != null) {
    logBalanceChain(session, { truckId: ctx.truckId, cycleId: ctx.cycleId, balanceBefore, entries: entries.map(e => ({ ...base, ...e })) })
  } else {
    entries.forEach(({ delta, ...e }) => { void delta; logAudit(session, { ...base, ...e }) })
  }
}

const actor = session => ({
  created_by_email: session?.user?.email || null,
  created_by_name: session?.user?.user_metadata?.name || null,
})

/** Saves lumpers read from one receipt photo (`file`, optional) and returns the new rows. */
export async function createLumpers(session, ctx, drafts, file) {
  const receiptPath = file ? await uploadReceipt(file, `lumper-${ctx.orderId}`) : null
  const balanceBefore = await balanceOf(ctx)
  const rows = drafts.map(d => ({
    order_id: ctx.orderId,
    amount: Number(d.amount) || 0,
    vendor: d.vendor?.trim() || null,
    receipt_number: d.receipt_number?.trim() || null,
    date: d.date || null,
    city: d.city?.trim() || null,
    notes: d.notes?.trim() || null,
    receipt_path: receiptPath,
    ...actor(session),
  }))
  const { data, error } = await supabase.from('order_lumpers').insert(rows).select()
  if (error) throw error
  audit(session, ctx, balanceBefore, data.map(l => ({
    action: 'create_lumper', entityId: l.id, delta: -lumperAmount(l), extraInfo: infoOf(l, ctx),
  })))
  return data
}

const EDITABLE = ['amount', 'vendor', 'receipt_number', 'date', 'city', 'notes']

/** Edits a lumper's fields (`patch`) and returns the updated row. */
export async function updateLumper(session, ctx, lumper, patch) {
  const clean = {}
  for (const f of EDITABLE) {
    if (!(f in patch)) continue
    clean[f] = f === 'amount' ? (Number(patch[f]) || 0) : (String(patch[f] ?? '').trim() || null)
  }
  const changes = {}
  for (const f of Object.keys(clean)) {
    const from = lumper[f] ?? null
    if (String(from ?? '') !== String(clean[f] ?? '')) changes[f] = { from, to: clean[f] }
  }
  if (!Object.keys(changes).length) return lumper
  const balanceBefore = await balanceOf(ctx)
  const { data, error } = await supabase.from('order_lumpers').update(clean).eq('id', lumper.id).select().single()
  if (error) throw error
  // Only an unpaid lumper is an expense: editing a reimbursed one moves nothing
  const delta = lumper.paid ? 0 : -(lumperAmount(data) - lumperAmount(lumper))
  audit(session, ctx, balanceBefore, [{ action: 'update_lumper', entityId: lumper.id, delta, extraInfo: infoOf(data, ctx, { changes }) }])
  return data
}

export async function deleteLumper(session, ctx, lumper) {
  const balanceBefore = await balanceOf(ctx)
  const { error } = await supabase.from('order_lumpers').delete().eq('id', lumper.id)
  if (error) throw error
  audit(session, ctx, balanceBefore, [{ action: 'delete_lumper', entityId: lumper.id, delta: lumper.paid ? 0 : lumperAmount(lumper), extraInfo: infoOf(lumper, ctx) }])
}

/**
 * Marks lumpers as paid (reimbursed: they stop counting as an expense and the
 * amount comes back to the truck) or unpaid (they count again). Returns the rows.
 */
export async function setLumpersPaid(session, ctx, lumpers, paid) {
  const changing = lumpers.filter(l => !!l.paid !== paid)
  if (!changing.length) return lumpers
  const balanceBefore = await balanceOf(ctx)
  const { data, error } = await supabase.from('order_lumpers')
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .in('id', changing.map(l => l.id)).select()
  if (error) throw error
  audit(session, ctx, balanceBefore, changing.map(l => ({
    action: paid ? 'pay_lumper' : 'unpay_lumper', entityId: l.id,
    delta: paid ? lumperAmount(l) : -lumperAmount(l), extraInfo: infoOf(l, ctx),
  })))
  return data
}

/**
 * Step 5 of the lumper flow: when an order is marked paid and it has unpaid
 * lumpers, asks whether the lumper was paid too. Call it AFTER the order was
 * saved as paid. "No" leaves the lumpers counting as an expense, exactly as
 * before; "Sí" marks them paid. Never throws — the order is already saved.
 */
export async function askLumpersOnOrderPaid(session, toast, ctx) {
  try {
    const unpaid = (await fetchOrderLumpers(ctx.orderId)).filter(l => !l.paid)
    if (!unpaid.length) return
    const total = unpaid.reduce((s, l) => s + lumperAmount(l), 0)
    const many = unpaid.length > 1
    const yes = await toast.confirm(
      `Esta carga tiene ${many ? `${unpaid.length} lumpers` : '1 lumper'} (${fmtMoney(total)}). ¿Ya se ${many ? 'pagaron' : 'pagó'} ${many ? 'los lumpers' : 'el lumper'}?`,
      { confirmText: 'Sí, ya se pagó', cancelText: 'No, todavía', confirmClass: 'bg-emerald-600 hover:bg-emerald-500' },
    )
    if (yes) {
      await setLumpersPaid(session, ctx, unpaid, true)
      toast.success(many ? 'Lumpers marcados como pagados' : 'Lumper marcado como pagado')
    }
  } catch (err) {
    console.warn('[lumpers] paid prompt', err)
  }
}
