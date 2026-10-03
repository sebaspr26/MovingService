import { supabase } from './supabase'
import { orderNet, leaseDriverDebit, STATUS_CONFIG } from './orders'
import { computeTruckBalance } from './balance'
import { getCompanySettings, getLogoUrl } from './company'
import { htmlToPdfBase64 } from './pdf'
import { downloadBase64Pdf } from './download'

// Cycle statement ("extracto") — a bank-statement style PDF of everything that
// happened in a truck's cycle: every movement that touched the balance in date
// order with a running balance, every order (paid or not), owner expenses, and
// the cash box close with the split between partners. Built from the same
// formulas as TruckView/computeTruckBalance, and it checks itself against
// computeTruckBalance so a mismatch is visible on the document itself.

const fmtMoney = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtDate = s => {
  if (!s) return '—'
  const [y, m, d] = String(s).slice(0, 10).split('-')
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const round2 = n => Math.round((Number(n) || 0) * 100) / 100

async function loadDispatcherNames() {
  try {
    const res = await fetch('/api/invite-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })
    const data = await res.json()
    return Object.fromEntries((data.users || []).map(u => [u.email, u.user_metadata?.name || u.email]))
  } catch {
    return {}
  }
}

async function loadCycleData(cycleId) {
  const { data: cycle, error } = await supabase.from('cycles').select('*').eq('id', cycleId).single()
  if (error || !cycle) throw new Error('No se encontro el ciclo')
  const truckId = cycle.truck_id

  const [truckRes, orders, diesel, def, expenses, accounting, ownerExpenses, partners, driverRes, driverPayments, dispatcherNames] = await Promise.all([
    supabase.from('trucks').select('*').eq('id', truckId).single(),
    supabase.from('orders').select('*').eq('truck_id', truckId).eq('cycle_id', cycleId).order('pu_date'),
    supabase.from('diesel').select('*').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('def').select('*').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('expenses').select('*').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('accounting').select('*').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('owner_expenses').select('*').eq('truck_id', truckId).eq('cycle_id', cycleId),
    supabase.from('partners').select('*').eq('truck_id', truckId).order('created_at'),
    supabase.from('drivers').select('name, pay_mode, pay_rate').eq('truck_id', truckId).eq('status', 'active').limit(1).maybeSingle(),
    supabase.from('driver_payments').select('order_ids').eq('truck_id', truckId),
    loadDispatcherNames(),
  ])
  const truck = truckRes.data
  if (!truck) throw new Error('No se encontro el camion')

  const brokerIds = [...new Set((orders.data || []).map(o => o.broker_id).filter(Boolean))]
  const [{ data: brokers }, company, balanceCheck] = await Promise.all([
    brokerIds.length ? supabase.from('brokers').select('id, name').in('id', brokerIds) : { data: [] },
    getCompanySettings(truck.company_id),
    computeTruckBalance(truckId, cycleId),
  ])

  return {
    cycle, truck, company,
    orders: orders.data || [],
    diesel: diesel.data || [],
    def: def.data || [],
    expenses: expenses.data || [],
    accounting: accounting.data || [],
    ownerExpenses: ownerExpenses.data || [],
    partners: partners.data || [],
    leaseDriver: driverRes.data,
    settledOrderIds: new Set((driverPayments.data || []).flatMap(p => p.order_ids || [])),
    brokerName: Object.fromEntries((brokers || []).map(b => [b.id, b.name])),
    dispatcherNames,
    balanceCheck,
  }
}

// Every movement that changes the balance, one row each — the same pieces that
// computeTruckBalance adds up (credits: previous balance, net of paid orders,
// accounting credits; debits: diesel, DEF, expenses, accounting debits, lease
// driver payout)
function buildLedger(d) {
  const discountPct = Number(d.truck.discount_percent) || 13
  const rows = []
  const by = r => r.created_by_name || r.created_by_email || ''

  for (const o of d.orders.filter(o => o.paid)) {
    const net = orderNet(o, discountPct)
    const pct = Number(o.discount_percent) || discountPct
    const route = [o.pu_city, o.do_city].filter(Boolean).join(' → ')
    const detail = o.apply_discount !== false ? `Rate ${fmtMoney(o.rate)} − ${pct}%` : `Rate ${fmtMoney(o.rate)} (sin descuento)`
    rows.push({
      date: o.do_date || o.pu_date, kind: o.status === 'tonu' ? 'Orden TONU' : 'Orden pagada',
      desc: `#${o.order_number}${route ? ` · ${route}` : ''}${d.brokerName[o.broker_id] ? ` · ${d.brokerName[o.broker_id]}` : ''}`,
      sub: `${detail}${o.carried_over ? ' · Traida del ciclo anterior' : ''}`,
      by: by(o), credit: net, debit: 0, sort: 1,
    })
    const leaseDebit = d.truck.is_lis ? leaseDriverDebit([o], d.leaseDriver, d.settledOrderIds) : 0
    if (leaseDebit) {
      rows.push({
        date: o.do_date || o.pu_date, kind: 'Pago conductor',
        desc: `#${o.order_number} · ${d.leaseDriver?.name || 'Conductor'}`,
        sub: `Rate ${fmtMoney(o.rate)} × ${100 - (Number(d.leaseDriver?.pay_rate) || 0)}%`,
        by: '', credit: 0, debit: leaseDebit, sort: 2,
      })
    }
  }
  for (const r of d.diesel) {
    rows.push({ date: r.date, kind: 'Diesel', desc: [r.invoice_number && `Factura ${r.invoice_number}`, r.city].filter(Boolean).join(' · ') || 'Diesel', sub: r.gallons ? `${r.gallons} gal` : '', by: by(r), credit: 0, debit: Number(r.value) || 0, sort: 3 })
  }
  for (const r of d.def) {
    rows.push({ date: r.date, kind: 'DEF', desc: [r.invoice_number && `Factura ${r.invoice_number}`, r.city].filter(Boolean).join(' · ') || 'DEF', sub: r.gallons ? `${r.gallons} gal` : '', by: by(r), credit: 0, debit: Number(r.value) || 0, sort: 3 })
  }
  for (const r of d.expenses) {
    const isDriverPay = r.source_payment_type || r.category === 'Pago Chofer'
    rows.push({ date: r.date, kind: isDriverPay ? 'Pago chofer' : `Gasto · ${r.category || 'Otros'}`, desc: r.description || '—', sub: r.invoice_number && r.invoice_number !== 'REC' ? `Factura ${r.invoice_number}` : '', by: by(r), credit: 0, debit: Number(r.amount) || 0, sort: 4 })
  }
  for (const r of d.accounting) {
    rows.push({ date: r.date, kind: 'Contabilidad', desc: r.description || '—', sub: r.reference ? `Ref. ${r.reference}` : '', by: '', credit: Number(r.credit) || 0, debit: Number(r.debit) || 0, sort: 5 })
  }

  rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.sort - b.sort)
  let running = Number(d.cycle.previous_balance) || 0
  for (const r of rows) {
    running += r.credit - r.debit
    r.balance = running
  }
  return rows
}

const CSS = `
  * { box-sizing: border-box; }
  .doc { width: 852px; background: #fff; color: #111827; font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.45; padding: 28px 30px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #111827; }
  .co { display: flex; gap: 12px; align-items: center; }
  .co img { height: 44px; max-width: 140px; object-fit: contain; }
  .co-name { font-size: 15px; font-weight: 700; }
  .muted { color: #6b7280; }
  .title { text-align: right; }
  .title h1 { font-size: 16px; margin: 0 0 4px; letter-spacing: .04em; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 10px; font-weight: 600; border: 1px solid #d1d5db; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 18px 0 6px; border: 1px solid #e5e7eb; border-radius: 6px; }
  .summary > div { padding: 10px 12px; border-right: 1px solid #e5e7eb; }
  .summary > div:last-child { border-right: 0; }
  .summary .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
  .summary .val { font-size: 15px; font-weight: 700; margin-top: 2px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; margin: 22px 0 6px; color: #374151; }
  table { width: 100%; border-collapse: collapse; }
  th { white-space: nowrap; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 600; padding: 6px 6px; border-bottom: 1px solid #d1d5db; }
  td { padding: 6px 6px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .cr { color: #047857; }
  .db { color: #b91c1c; }
  .sub { color: #6b7280; font-size: 10px; }
  .kind { white-space: nowrap; font-weight: 600; }
  tr.total td { border-top: 1px solid #111827; border-bottom: 0; font-weight: 700; }
  tr.open td { background: #f9fafb; font-weight: 600; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .note { font-size: 10px; color: #6b7280; margin-top: 4px; }
  .check { margin-top: 22px; padding: 8px 10px; border-radius: 6px; font-size: 10px; }
  .check.ok { background: #ecfdf5; color: #065f46; }
  .check.bad { background: #fef2f2; color: #991b1b; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; }
`

function buildHtml(d) {
  const { cycle, truck, company } = d
  const info = company?.company_info || {}
  const companyName = info.company_name || info.dba || 'Empresa'
  const logo = company?.logo_path ? getLogoUrl(company.logo_path) : null
  const discountPct = Number(truck.discount_percent) || 13

  const ledger = buildLedger(d)
  const previousBalance = Number(cycle.previous_balance) || 0
  const totalCredit = ledger.reduce((s, r) => s + r.credit, 0)
  const totalDebit = ledger.reduce((s, r) => s + r.debit, 0)
  const finalBalance = previousBalance + totalCredit - totalDebit
  const matches = round2(finalBalance) === round2(d.balanceCheck)

  // Category totals
  const cat = new Map()
  const addCat = (k, credit, debit) => { const c = cat.get(k) || { credit: 0, debit: 0, n: 0 }; c.credit += credit; c.debit += debit; c.n++; cat.set(k, c) }
  ledger.forEach(r => addCat(r.kind === 'Orden TONU' ? 'Orden pagada' : r.kind, r.credit, r.debit))

  const cuadre = Number(cycle.cuadre_caja) || 0
  const toSplit = finalBalance - cuadre
  const closed = !!cycle.closed

  // Older rows have no created_by — skip the column instead of leaving it blank
  const showBy = ledger.some(r => r.by)
  const ledgerRows = ledger.map(r => `
    <tr>
      <td style="white-space:nowrap">${fmtDate(r.date)}</td>
      <td class="kind">${esc(r.kind)}</td>
      <td>${esc(r.desc)}${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ''}</td>
      ${showBy ? `<td class="sub">${esc(r.by)}</td>` : ''}
      <td class="num db">${r.debit ? fmtMoney(r.debit) : ''}</td>
      <td class="num cr">${r.credit ? fmtMoney(r.credit) : ''}</td>
      <td class="num">${fmtMoney(r.balance)}</td>
    </tr>`).join('')

  const orderRows = d.orders.map(o => `
    <tr>
      <td style="white-space:nowrap">#${esc(o.order_number)}${o.carried_over ? '<div class="sub">Ciclo ant.</div>' : ''}</td>
      <td style="white-space:nowrap">${fmtDate(o.pu_date)}<div class="sub">${fmtDate(o.do_date)}</div></td>
      <td>${esc(o.pu_city || '—')}<div class="sub">${esc(o.do_city || '—')}</div></td>
      <td>${esc(d.brokerName[o.broker_id] || '—')}<div class="sub">${esc(d.dispatcherNames[o.dispatcher] || o.dispatcher || '')}</div></td>
      <td>${esc(STATUS_CONFIG[o.status]?.label || o.status || '—')}</td>
      <td class="num">${fmtMoney(o.rate)}</td>
      <td class="num">${fmtMoney(orderNet(o, discountPct))}</td>
      <td class="num">${o.paid ? 'Sí' : '<span class="db">No</span>'}</td>
    </tr>`).join('')
  const unpaid = d.orders.filter(o => !o.paid)

  const ownerRows = d.ownerExpenses.map(r => `
    <tr><td>${fmtDate(r.date)}</td><td>${esc(r.category || '—')}</td><td>${esc(r.description || '—')}</td><td class="num">${fmtMoney(r.amount)}</td></tr>`).join('')
  const ownerTotal = d.ownerExpenses.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const partnerRows = d.partners.map(p => `
    <tr><td>${esc(p.name)}</td><td class="num">${Number(p.percentage) || 0}%</td><td class="num">${fmtMoney(toSplit > 0 ? toSplit * (Number(p.percentage) || 0) / 100 : 0)}</td></tr>`).join('')
  const partnerPct = d.partners.reduce((s, p) => s + (Number(p.percentage) || 0), 0)

  const catRows = [...cat.entries()].sort(([, a], [, b]) => (b.credit - a.credit) || (b.debit - a.debit)).map(([k, c]) => `
    <tr><td>${esc(k)}</td><td class="num muted">${c.n}</td><td class="num db">${c.debit ? fmtMoney(c.debit) : ''}</td><td class="num cr">${c.credit ? fmtMoney(c.credit) : ''}</td></tr>`).join('')

  const generated = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

  // <style> goes inside .doc: htmlToPdfBase64 keeps only the body, and renders
  // its first element
  return `<html><body><div class="doc"><style>${CSS}</style>
    <div class="head">
      <div class="co">
        ${logo ? `<img src="${esc(logo)}" crossorigin="anonymous" />` : ''}
        <div>
          <div class="co-name">${esc(companyName)}</div>
          ${info.dba && info.dba !== companyName ? `<div class="muted">DBA ${esc(info.dba)}</div>` : ''}
          <div class="muted">${[info.mc_number && `MC# ${esc(info.mc_number)}`, info.dot_number && `DOT# ${esc(info.dot_number)}`].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div class="title">
        <h1>ESTADO DE CUENTA DEL CICLO</h1>
        <div><b>${esc(truck.name)}</b>${truck.number ? ` · #${esc(truck.number)}` : ''}${truck.is_lis ? ' · LIS' : ''}</div>
        <div class="muted">${fmtDate(cycle.start_date)} — ${closed ? fmtDate(cycle.end_date || cycle.closed_at) : 'en curso'}</div>
        <div style="margin-top:4px"><span class="pill">${closed ? 'Ciclo cerrado' : 'Reporte preliminar · ciclo abierto'}</span></div>
      </div>
    </div>

    <div class="summary">
      <div><div class="lbl">Saldo anterior</div><div class="val">${fmtMoney(previousBalance)}</div></div>
      <div><div class="lbl">Créditos</div><div class="val cr">+${fmtMoney(totalCredit)}</div></div>
      <div><div class="lbl">Débitos</div><div class="val db">−${fmtMoney(totalDebit)}</div></div>
      <div><div class="lbl">Balance final</div><div class="val">${fmtMoney(finalBalance)}</div></div>
    </div>
    ${d.truck.is_lis && d.leaseDriver ? `<div class="note">Conductor: ${esc(d.leaseDriver.name)}${d.leaseDriver.pay_mode === 'percentage' ? ` · ${Number(d.leaseDriver.pay_rate) || 0}%` : ''}</div>` : ''}

    <h2>Movimientos</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th>${showBy ? '<th>Agregado por</th>' : ''}<th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr></thead>
      <tbody>
        <tr class="open"><td>${fmtDate(cycle.start_date)}</td><td class="kind">Saldo anterior</td><td>Balance con el que abrió el ciclo</td>${showBy ? '<td></td>' : ''}<td></td><td class="num cr">${previousBalance ? fmtMoney(previousBalance) : ''}</td><td class="num">${fmtMoney(previousBalance)}</td></tr>
        ${ledgerRows || `<tr><td colspan="${showBy ? 7 : 6}" class="muted">Sin movimientos en este ciclo</td></tr>`}
        <tr class="total"><td colspan="${showBy ? 4 : 3}">Totales</td><td class="num db">${fmtMoney(totalDebit)}</td><td class="num cr">${fmtMoney(previousBalance + totalCredit)}</td><td class="num">${fmtMoney(finalBalance)}</td></tr>
      </tbody>
    </table>

    <div class="two">
      <div>
        <h2>Resumen por tipo</h2>
        <table>
          <thead><tr><th>Tipo</th><th class="num">Mov.</th><th class="num">Débito</th><th class="num">Crédito</th></tr></thead>
          <tbody>${catRows || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
      <div>
        <h2>Cierre de caja</h2>
        <table>
          <tbody>
            <tr><td>Balance final del ciclo</td><td class="num">${fmtMoney(finalBalance)}</td></tr>
            <tr><td>Dejado en caja para el siguiente ciclo</td><td class="num">${closed ? fmtMoney(cuadre) : '—'}</td></tr>
            <tr class="total"><td>Repartido entre socios</td><td class="num">${closed ? fmtMoney(toSplit) : '—'}</td></tr>
          </tbody>
        </table>
        ${closed && d.partners.length ? `
        <table style="margin-top:8px">
          <thead><tr><th>Socio</th><th class="num">%</th><th class="num">Monto</th></tr></thead>
          <tbody>${partnerRows}</tbody>
        </table>
        ${partnerPct !== 100 ? `<div class="note">Los porcentajes de los socios suman ${partnerPct}%, no 100%.</div>` : ''}` : ''}
        ${closed && !d.partners.length ? '<div class="note">Este camión no tiene socios registrados.</div>' : ''}
        ${closed && toSplit < 0 ? '<div class="note">El monto a repartir es negativo: no hay dividendos este ciclo.</div>' : ''}
        ${!closed ? '<div class="note">El ciclo sigue abierto: el cierre de caja aparece al cerrarlo.</div>' : ''}
      </div>
    </div>

    <h2>Órdenes del ciclo (${d.orders.length})</h2>
    <table>
      <thead><tr><th>Orden</th><th>Pickup / Delivery</th><th>Origen / Destino</th><th>Broker / Dispatcher</th><th>Status</th><th class="num">Rate</th><th class="num">Neto</th><th class="num">Pagada</th></tr></thead>
      <tbody>${orderRows || '<tr><td colspan="8" class="muted">Sin órdenes en este ciclo</td></tr>'}</tbody>
    </table>
    <div class="note">Solo las órdenes pagadas entran al balance.${unpaid.length ? ` ${unpaid.length} sin pagar por ${fmtMoney(unpaid.reduce((s, o) => s + orderNet(o, discountPct), 0))} neto.` : ''}</div>

    ${d.ownerExpenses.length ? `
    <h2>Gastos del propietario${truck.owner_name ? ` · ${esc(truck.owner_name)}` : ''}</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="num">Monto</th></tr></thead>
      <tbody>${ownerRows}<tr class="total"><td colspan="3">Total</td><td class="num">${fmtMoney(ownerTotal)}</td></tr></tbody>
    </table>
    <div class="note">Informativo: los gastos del propietario no afectan el balance del ciclo.</div>` : ''}

    <div class="check ${matches ? 'ok' : 'bad'}">
      ${matches
        ? `Verificado: el balance de este reporte (${fmtMoney(finalBalance)}) coincide con el balance del camión en la app.`
        : `Atención: el balance de este reporte (${fmtMoney(finalBalance)}) no coincide con el de la app (${fmtMoney(d.balanceCheck)}). Revisar los movimientos del ciclo.`}
    </div>

    <div class="foot"><span>${esc(companyName)} · ${esc(truck.name)}</span><span>Generado el ${esc(generated)}</span></div>
  </div></body></html>`
}

// The statement as HTML (what gets rendered into the PDF)
export async function buildCycleReportHtml(cycleId) {
  const data = await loadCycleData(cycleId)
  return { html: buildHtml(data), data }
}

export async function generateCycleReport(cycleId) {
  const { html, data } = await buildCycleReportHtml(cycleId)
  const base64 = await htmlToPdfBase64(html, { containerWidth: 900 })
  const safe = s => String(s || '').replace(/[^\w-]+/g, '_')
  const filename = `Ciclo_${safe(data.truck.name)}_${data.cycle.start_date || ''}${data.cycle.closed ? `_al_${(data.cycle.end_date || '').slice(0, 10)}` : '_preliminar'}.pdf`
  return { base64, filename }
}

export async function downloadCycleReport(cycleId) {
  const { base64, filename } = await generateCycleReport(cycleId)
  downloadBase64Pdf(base64, filename)
}
