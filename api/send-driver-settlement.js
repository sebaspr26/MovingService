import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_KEY)
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)
}
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}
function fmtMiles(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' mi'
}

async function getCompanyData() {
  const { data } = await supabaseAdmin.from('company_settings')
    .select('company_info, billing_info, logo_path').limit(1).single()
  const companyName = data?.company_info?.company_name || data?.company_info?.dba || 'Moving Services'
  const logoUrl = data?.logo_path
    ? supabaseAdmin.storage.from('company-docs').getPublicUrl(data.logo_path).data?.publicUrl || null
    : null
  const billing = data?.billing_info || {}
  const companyInfo = data?.company_info || {}
  return { companyName, logoUrl, billing, companyInfo }
}

const PAY_MODE_LABELS = {
  flat_rate: 'Flat Rate',
  percentage: 'Percentage',
  per_mile: 'Per Mile',
}

function payBreakdownLabel(payMode, payRate, order) {
  if (payMode === 'flat_rate') return 'Fixed pay'
  if (payMode === 'percentage') return `${fmt(order.rate)} × ${payRate}%`
  if (payMode === 'per_mile') {
    const miles = (Number(order.miles) || 0) + (Number(order.dead_miles) || 0)
    return `${miles.toLocaleString()} mi × ${payRate}¢`
  }
  return ''
}

function payLineAmount(payMode, payRate, order) {
  if (payMode === 'flat_rate') return null
  if (payMode === 'percentage') return (Number(order.rate) || 0) * payRate / 100
  if (payMode === 'per_mile') {
    const miles = (Number(order.miles) || 0) + (Number(order.dead_miles) || 0)
    return miles * payRate / 100
  }
  return null
}

function logoBlock(logoUrl, companyName) {
  if (logoUrl) return `<img src="${logoUrl}" alt="${companyName}" style="height:56px;max-width:160px;object-fit:contain;display:block;" />`
  const initials = companyName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return `<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#fff3e0;border:2px solid #ea580c;border-radius:10px;font-size:22px;font-weight:800;color:#ea580c;">${initials}</div>`
}

function driverSettlementHtml({ companyName, logoUrl, billing, companyInfo, paymentNumber, driverName, driverEmail, truckName, payMode, payRate, gross, totalMiles, payout, payDate, periodStart, periodEnd, orders }) {
  const dot = companyInfo.dot || ''
  const mc = companyInfo.mc || ''
  const address = billing.address || companyInfo.address || ''
  const phone = billing.phone || companyInfo.phone || ''
  const email = billing.email || companyInfo.email || ''

  const ordersRows = orders.map(o => {
    const linePay = payLineAmount(payMode, payRate, o)
    const miles = (Number(o.miles) || 0) + (Number(o.dead_miles) || 0)
    return `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:13px 10px;font-size:13px;color:#111827;font-weight:700;vertical-align:top;">${o.order_number || '—'}</td>
        <td style="padding:13px 10px;font-size:12px;color:#374151;vertical-align:top;">
          ${o.pu_city || '—'}<br><span style="color:#6b7280;">→</span> ${o.do_city || '—'}
        </td>
        <td style="padding:13px 10px;font-size:12px;color:#374151;vertical-align:top;">
          ${fmtDate(o.pu_date)}<br><span style="color:#9ca3af;">${fmtDate(o.do_date)}</span>
        </td>
        <td style="padding:13px 10px;font-size:12px;color:#374151;vertical-align:top;">
          ${miles.toLocaleString()} mi total<br>
          <span style="color:#9ca3af;">${Number(o.miles||0).toLocaleString()} loaded + ${Number(o.dead_miles||0).toLocaleString()} DH</span>
        </td>
        <td style="padding:13px 10px;font-size:12px;color:#374151;vertical-align:top;">
          ${payBreakdownLabel(payMode, payRate, o)}
        </td>
        <td style="padding:13px 10px;font-size:13px;color:#111827;font-weight:600;text-align:right;vertical-align:top;">${fmt(o.rate)}</td>
        ${linePay !== null ? `<td style="padding:13px 10px;font-size:13px;color:#16a34a;font-weight:700;text-align:right;vertical-align:top;">${fmt(linePay)}</td>` : `<td style="padding:13px 10px;font-size:12px;color:#9ca3af;text-align:right;vertical-align:top;">—</td>`}
      </tr>`
  }).join('')

  const payModeLabel = PAY_MODE_LABELS[payMode] || payMode
  let payRateDisplay = ''
  if (payMode === 'flat_rate') payRateDisplay = `Fixed: ${fmt(payRate)}`
  if (payMode === 'percentage') payRateDisplay = `${payRate}% of gross`
  if (payMode === 'per_mile') payRateDisplay = `${payRate}¢ per mile`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Driver Settlement #${paymentNumber}</title></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:860px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="padding:28px 40px;background:#fff;border-bottom:2px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
    <div>${logoBlock(logoUrl, companyName)}</div>
    <div style="text-align:right;">
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#111827;">Driver Settlement #${paymentNumber}</h1>
      <p style="margin:5px 0 0;font-size:13px;color:#6b7280;">Pay Date: ${fmtDate(payDate)}</p>
    </div>
  </div>

  <!-- Company + Driver Info -->
  <div style="padding:28px 40px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;gap:24px;align-items:flex-start;">
    <div style="flex:1;">
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:900;color:#111827;text-transform:uppercase;">${companyName}</h2>
      ${dot || mc ? `<p style="margin:3px 0;font-size:13px;color:#374151;">${dot ? `DOT: <strong>${dot}</strong>` : ''}${dot && mc ? '&nbsp;&nbsp;' : ''}${mc ? `MC: <strong>${mc}</strong>` : ''}</p>` : ''}
      ${address ? `<p style="margin:3px 0;font-size:13px;color:#374151;">Address: <strong>${address}</strong></p>` : ''}
      ${phone ? `<p style="margin:3px 0;font-size:13px;color:#374151;">Phone: <strong>${phone}</strong></p>` : ''}
      ${email ? `<p style="margin:3px 0;font-size:13px;color:#374151;">Email: <strong>${email}</strong></p>` : ''}
    </div>
    <div style="flex:0 0 300px;border:1.5px solid #d1d5db;border-radius:14px;padding:18px 20px;background:#fff;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:5px 0;font-size:12px;color:#6b7280;">Driver:</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:800;text-align:right;">${driverName.toUpperCase()}</td></tr>
        ${driverEmail ? `<tr><td style="padding:5px 0;font-size:12px;color:#6b7280;">Email:</td><td style="padding:5px 0;font-size:12px;color:#374151;font-weight:600;text-align:right;">${driverEmail}</td></tr>` : ''}
        ${truckName ? `<tr><td style="padding:5px 0;font-size:12px;color:#6b7280;">Truck:</td><td style="padding:5px 0;font-size:12px;color:#374151;font-weight:600;text-align:right;">${truckName}</td></tr>` : ''}
        <tr><td style="padding:5px 0;font-size:12px;color:#6b7280;">Pay Type:</td><td style="padding:5px 0;font-size:13px;color:#ea580c;font-weight:800;text-align:right;">${payModeLabel}</td></tr>
        <tr><td style="padding:5px 0;font-size:12px;color:#6b7280;">Rate:</td><td style="padding:5px 0;font-size:12px;color:#111827;font-weight:700;text-align:right;">${payRateDisplay}</td></tr>
        ${periodStart ? `<tr><td style="padding:5px 0;font-size:12px;color:#6b7280;">Period:</td><td style="padding:5px 0;font-size:12px;color:#111827;font-weight:600;text-align:right;">${fmtDate(periodStart)} – ${fmtDate(periodEnd)}</td></tr>` : ''}
        <tr><td style="padding:5px 0;font-size:12px;color:#6b7280;">Pay Date:</td><td style="padding:5px 0;font-size:12px;color:#111827;font-weight:700;text-align:right;">${fmtDate(payDate)}</td></tr>
      </table>
    </div>
  </div>

  <!-- Summary -->
  <div style="padding:24px 40px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:28px;">
    <div style="flex:1;background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:14px;padding:18px 20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:5px 0;font-size:13px;color:#374151;">Loads:</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:700;text-align:right;">${orders.length}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#374151;">Gross Revenue:</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;text-align:right;">${fmt(gross)}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#374151;">Total Miles:</td><td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;text-align:right;">${fmtMiles(totalMiles)}</td></tr>
        <tr style="border-top:1.5px solid #d1d5db;"><td style="padding:10px 0 5px;font-size:14px;color:#16a34a;font-weight:800;">Total Pay:</td><td style="padding:10px 0 5px;font-size:14px;color:#16a34a;font-weight:800;text-align:right;">${fmt(payout)}</td></tr>
      </table>
    </div>
    <div style="text-align:center;min-width:150px;">
      <p style="margin:0 0 6px;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Total Pay</p>
      <div style="border-bottom:2.5px solid #111827;margin:0 auto 8px;width:130px;"></div>
      <p style="margin:0;font-size:32px;font-weight:900;color:#111827;letter-spacing:-1px;">${fmt(payout)}</p>
    </div>
  </div>

  <!-- Orders table -->
  <div style="padding:28px 40px 36px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f3f4f6;border-bottom:2px solid #d1d5db;">
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;">Load</th>
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;">Route</th>
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;">Date</th>
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;">Miles</th>
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;">Pay Breakdown</th>
          <th style="padding:11px 10px;text-align:right;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;">Rate</th>
          <th style="padding:11px 10px;text-align:right;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;">Pay</th>
        </tr>
      </thead>
      <tbody>${ordersRows}</tbody>
      <tfoot>
        <tr style="border-top:2px solid #111827;">
          <td colspan="6" style="padding:14px 10px;font-size:13px;color:#374151;font-weight:700;text-align:right;">Total Pay:</td>
          <td style="padding:14px 10px;font-size:16px;font-weight:900;color:#16a34a;text-align:right;">${fmt(payout)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:16px 40px;border-top:1px solid #e5e7eb;background:#f9fafb;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">${companyName} &mdash; Driver Settlement &middot; ${fmtDate(payDate)}</p>
  </div>
</div>
</body></html>`
}

function emailBody({ companyName, logoUrl, driverName, paymentNumber, payMode, payRate, gross, totalMiles, payout, periodStart, periodEnd, payDate }) {
  const payRateDisplay = payMode === 'flat_rate' ? `Fixed ${fmt(payRate)}` : payMode === 'percentage' ? `${payRate}%` : `${payRate}¢/mi`
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <tr><td style="background:#0891b2;padding:28px 32px;">
    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height:44px;max-width:130px;object-fit:contain;display:block;margin-bottom:14px;" />` : `<p style="margin:0 0 14px;font-size:15px;font-weight:800;color:#fff;">${companyName}</p>`}
    <h1 style="margin:0;font-size:22px;font-weight:900;color:#fff;">Payment Summary #${paymentNumber}</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#cffafe;">Pay date: ${fmtDate(payDate)}</p>
  </td></tr>
  <tr><td style="padding:28px 32px 20px;">
    <p style="margin:0 0 18px;font-size:15px;color:#111827;">Hi <strong>${driverName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
      Your payment summary for <strong>${fmtDate(periodStart)} – ${fmtDate(periodEnd)}</strong> is ready. See the attached PDF for the full breakdown.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
        <table width="100%"><tr>
          <td style="font-size:12px;color:#6b7280;">Pay Type</td>
          <td align="right" style="font-size:13px;color:#0891b2;font-weight:800;">${PAY_MODE_LABELS[payMode] || payMode} · ${payRateDisplay}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
        <table width="100%"><tr>
          <td style="font-size:12px;color:#6b7280;">Gross Revenue</td>
          <td align="right" style="font-size:13px;color:#111827;font-weight:700;">${fmt(gross)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
        <table width="100%"><tr>
          <td style="font-size:12px;color:#6b7280;">Total Miles</td>
          <td align="right" style="font-size:13px;color:#111827;font-weight:700;">${fmtMiles(totalMiles)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:18px 20px;background:#f0fdf4;">
        <table width="100%"><tr>
          <td style="font-size:14px;color:#166534;font-weight:800;">Total Pay</td>
          <td align="right" style="font-size:24px;color:#16a34a;font-weight:900;">${fmt(payout)}</td>
        </tr></table>
      </td></tr>
    </table>
    <p style="margin:0;font-size:12px;color:#9ca3af;">Questions? Reply to this email.</p>
  </td></tr>
  <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">${companyName} — Automated payment notification.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, paymentNumber, driverEmail, driverName, truckName, payMode, payRate, gross, totalMiles, payout, payDate, periodStart, periodEnd, orders = [], pdfBase64 } = req.body
  if (!driverName) return res.status(400).json({ error: 'Falta driverName' })

  try {
    const { companyName, logoUrl, billing, companyInfo } = await getCompanyData()

    const html = driverSettlementHtml({ companyName, logoUrl, billing, companyInfo, paymentNumber, driverName, driverEmail, truckName, payMode, payRate, gross, totalMiles, payout, payDate, periodStart, periodEnd, orders })

    if (action === 'preview') return res.status(200).json({ success: true, html })

    if (!driverEmail) return res.status(400).json({ error: 'Este conductor no tiene email registrado' })

    const body = emailBody({ companyName, logoUrl, driverName, paymentNumber, payMode, payRate, gross, totalMiles, payout, periodStart, periodEnd, payDate })
    const text = `${companyName} — Driver Settlement #${paymentNumber}\n\nHi ${driverName},\n\nYour payment for ${fmtDate(periodStart)} – ${fmtDate(periodEnd)} is attached.\n\nGross: ${fmt(gross)}\nMiles: ${fmtMiles(totalMiles)}\nTotal Pay: ${fmt(payout)}\n\n— ${companyName}`

    const opts = {
      from: `${companyName} <invoices@etg-tms.com>`,
      reply_to: billing.email || companyInfo.email || undefined,
      to: [driverEmail],
      subject: `Payment Summary #${paymentNumber} — ${driverName}`,
      html: body,
      text,
    }
    if (pdfBase64) {
      opts.attachments = [{
        filename: `Settlement_${String(paymentNumber).padStart(3, '0')}_${(driverName || 'driver').replace(/\s+/g, '_')}.pdf`,
        content: Buffer.from(pdfBase64, 'base64'),
      }]
    }

    const { data, error } = await resend.emails.send(opts)
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ success: true, id: data?.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
