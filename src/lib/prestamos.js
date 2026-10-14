import { supabase } from './supabase'
import { hasFeature } from './company'
import { logAudit } from './auditLog'

// Préstamos (only companies with features.prestamos — Dacrisam). Each
// dispatcher/admin has a "caja": what comes in minus what goes out.
//   IN:  their commission payments (dispatcher_payments, from Pago Dispatchers)
//        money they hand over outside the app ('deposit', once confirmed)
//   OUT: money sent to them, any amount ('payout'; may point to the payment
//        it comes from — a $500 payment with $100 sent leaves $400 in caja)
//        loans ('loan', can leave the caja negative)
// What the user asks for (send, loan, deposit) waits as 'pending' until the
// super admin approves or rejects it. See 040/041_prestamos*.sql.

export const PRESTAMO_ROLES = ['super_admin', 'admin', 'dispatcher']

export const KIND_LABEL = { payout: 'Envío', loan: 'Préstamo', deposit: 'Abono' }

const lower = s => String(s || '').trim().toLowerCase()
const money = n => Math.round((Number(n) || 0) * 100) / 100

/** Whether this user sees Préstamos in this company. */
export function canSeePrestamos(session, company) {
  return hasFeature(company, 'prestamos') && PRESTAMO_ROLES.includes(session?.user?.user_metadata?.role)
}

/**
 * Payments and movements of the company — or of one user (`email`).
 * { payments: [...dispatcher_payments], movements: [...caja_movements] }
 */
export async function loadCajaData(companyId, email = null) {
  let pq = supabase.from('dispatcher_payments')
    .select('id, dispatcher_email, dispatcher_name, payout, pay_date, period_start, period_end, payment_number, created_at')
    .eq('company_id', companyId).order('pay_date', { ascending: false })
  let mq = supabase.from('caja_movements').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
  if (email) {
    pq = pq.ilike('dispatcher_email', email.trim())
    mq = mq.eq('user_email', lower(email))
  }
  const [p, m] = await Promise.all([pq, mq])
  if (p.error) throw p.error
  if (m.error) throw m.error
  return { payments: p.data || [], movements: m.data || [] }
}

/**
 * One user's caja from the company data:
 * { balance (in caja), earned, deposits (in), sent, loans (out),
 *   payments: [newest first, each with sentAmount and remaining],
 *   toSend: payments with something left, pending: [pending requests],
 *   history: [{ date, kind, label, amount (signed), status, balance?, ... }] }
 */
export function cajaOf(email, { payments, movements }) {
  const e = lower(email)
  const mine = payments.filter(p => lower(p.dispatcher_email) === e)
  const moves = movements.filter(m => m.user_email === e)
  const approved = moves.filter(m => m.status === 'approved')
  const sum = (rows, k = 'amount') => money(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0))

  // How much of each incoming payment was already sent
  const sentByPayment = {}
  for (const m of approved) {
    if (m.kind === 'payout' && m.dispatcher_payment_id) sentByPayment[m.dispatcher_payment_id] = money((sentByPayment[m.dispatcher_payment_id] || 0) + Number(m.amount))
  }
  const withSent = mine.map(p => {
    const sentAmount = sentByPayment[p.id] || 0
    return { ...p, sentAmount, remaining: money(Math.max((Number(p.payout) || 0) - sentAmount, 0)) }
  })

  const earned = sum(mine, 'payout')
  const sent = sum(approved.filter(m => m.kind === 'payout'))
  const loans = sum(approved.filter(m => m.kind === 'loan'))
  const deposits = sum(approved.filter(m => m.kind === 'deposit'))

  // History, oldest first so the running balance reads top to bottom
  const entries = [
    ...mine.map(p => ({
      id: `p-${p.id}`, date: p.pay_date || String(p.created_at).slice(0, 10), at: p.created_at,
      kind: 'earned', label: `Entró pago #${p.payment_number ?? ''}`.trim(), amount: money(p.payout), status: 'approved', payment: p,
    })),
    ...moves.map(m => ({
      id: m.id, date: String(m.decided_at || m.created_at).slice(0, 10), at: m.decided_at || m.created_at,
      kind: m.kind, label: KIND_LABEL[m.kind], status: m.status, movement: m,
      amount: money(m.kind === 'deposit' ? m.amount : -m.amount),
    })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  let running = 0
  for (const h of entries) {
    if (h.status === 'approved') running = money(running + h.amount)
    h.balance = h.status === 'approved' ? running : null
  }

  return {
    balance: money(earned - sent - loans + deposits),
    earned, sent, loans, deposits,
    payments: withSent,
    toSend: withSent.filter(p => p.remaining > 0),
    pending: moves.filter(m => m.status === 'pending'),
    history: entries.reverse(),
  }
}

const actor = session => ({
  email: session?.user?.email || null,
  name: session?.user?.user_metadata?.name || session?.user?.email || null,
})

function audit(session, action, row, extra = {}) {
  logAudit(session, {
    action, entityType: 'caja', entityId: row.id, entityName: row.user_name || row.user_email,
    extraInfo: { user: row.user_email, amount: Number(row.amount), kind: row.kind, note: row.note || null, ...extra },
  })
}

/**
 * A user asks for a loan / reports money handed over (pending), or the super
 * admin registers one directly (`approve: true`).
 */
export async function createMovement(session, companyId, { kind, user, amount, note, approve = false, payment = null }) {
  const by = actor(session)
  const row = {
    company_id: companyId, user_email: lower(user.email), user_name: user.name || null,
    kind, amount: money(amount), note: note?.trim() || null,
    dispatcher_payment_id: payment?.id || null,
    status: approve ? 'approved' : 'pending',
    requested_by_email: by.email, requested_by_name: by.name,
    ...(approve ? { decided_by_email: by.email, decided_by_name: by.name, decided_at: new Date().toISOString() } : {}),
  }
  const { data, error } = await supabase.from('caja_movements').insert(row).select().single()
  if (error) throw error
  audit(session, approve ? (kind === 'payout' ? 'caja_payout_sent' : `caja_${kind}_registered`) : `caja_${kind}_requested`, data,
    payment ? { payment_number: payment.payment_number } : {})
  return data
}

/** Super admin approves or rejects a pending loan/deposit. */
export async function decideMovement(session, movement, approve) {
  const by = actor(session)
  const { data, error } = await supabase.from('caja_movements')
    .update({ status: approve ? 'approved' : 'rejected', decided_by_email: by.email, decided_by_name: by.name, decided_at: new Date().toISOString() })
    .eq('id', movement.id).eq('status', 'pending') // not if someone decided it meanwhile
    .select()
  if (error) throw error
  if (!data?.length) throw new Error('Esta solicitud ya fue decidida')
  audit(session, approve ? `caja_${movement.kind}_approved` : `caja_${movement.kind}_rejected`, data[0])
  return data[0]
}

/** The user cancels his own request while it's still pending. */
export async function cancelMovement(session, movement) {
  const { data, error } = await supabase.from('caja_movements').delete().eq('id', movement.id).eq('status', 'pending').select()
  if (error) throw error
  if (!data?.length) throw new Error('Esta solicitud ya fue decidida')
  audit(session, `caja_${movement.kind}_canceled`, movement)
}

/** Super admin sends what's left of each of these payments (e.g. ones already paid before Préstamos). */
export async function sendRemaining(session, companyId, user, payments) {
  payments = payments.filter(p => p.remaining > 0)
  if (!payments.length) return []
  const by = actor(session)
  const now = new Date().toISOString()
  const rows = payments.map(p => ({
    company_id: companyId, user_email: lower(user.email), user_name: user.name || p.dispatcher_name || null,
    kind: 'payout', amount: money(p.remaining), status: 'approved', dispatcher_payment_id: p.id,
    note: `Pago #${p.payment_number ?? ''}`.trim(),
    requested_by_email: by.email, requested_by_name: by.name,
    decided_by_email: by.email, decided_by_name: by.name, decided_at: now,
  }))
  const { data, error } = await supabase.from('caja_movements').insert(rows).select()
  if (error) throw error
  for (const r of data || []) audit(session, 'caja_payout_sent', r, { payment_number: payments.find(p => p.id === r.dispatcher_payment_id)?.payment_number })
  return data
}
