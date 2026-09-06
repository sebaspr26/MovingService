import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)
}
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

async function getCompanyData(companyId) {
  const query = supabaseAdmin.from('company_settings').select('company_info, billing_info, logo_path')
  if (companyId) query.eq('id', companyId)
  const { data } = await query.limit(1).single()
  const companyName = data?.company_info?.company_name || data?.company_info?.dba || 'Moving Services'
  const logoUrl = data?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/${data.logo_path}` : null
  const billing = data?.billing_info || {}
  const companyInfo = data?.company_info || {}
  return { companyName, logoUrl, billing, companyInfo }
}

function logoBlock(logoUrl, companyName) {
  if (logoUrl) {
    return `<img src="${logoUrl}" alt="${companyName}" style="height:64px;max-width:180px;object-fit:contain;display:block;" />`
  }
  const initials = companyName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return `<div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:#fff3e0;border:2px solid #ea580c;border-radius:12px;font-size:24px;font-weight:800;color:#ea580c;">${initials}</div>`
}

function dispatcherSettlementHtml({ companyName, logoUrl, billing, companyInfo, paymentNumber, dispatcherName, dispatcherEmail, commissionPct, gross, payout, payDate, periodStart, periodEnd, orders }) {
  const ordersRows = orders.map(o => {
    const commission = (Number(o.rate) || 0) * commissionPct / 100
    return `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:13px 10px;font-size:13px;color:#111827;font-weight:700;vertical-align:top;">${o.order_number || '—'}</td>
        <td style="padding:13px 10px;font-size:12px;color:#374151;vertical-align:top;">
          ${o.pu_city || '—'}<br>
          <span style="color:#6b7280;">→</span> ${o.do_city || '—'}
        </td>
        <td style="padding:13px 10px;font-size:12px;color:#374151;vertical-align:top;">
          ${fmtDate(o.pu_date)}<br>
          <span style="color:#9ca3af;">${fmtDate(o.do_date)}</span>
        </td>
        <td style="padding:13px 10px;font-size:12px;color:#374151;vertical-align:top;">
          Percentage From Load:<br>
          <span style="color:#9ca3af;">${fmt(o.rate)} × ${commissionPct}%</span>
        </td>
        <td style="padding:13px 10px;font-size:13px;color:#111827;font-weight:600;text-align:right;vertical-align:top;">${fmt(o.rate)}</td>
        <td style="padding:13px 10px;font-size:13px;color:#16a34a;font-weight:700;text-align:right;vertical-align:top;">${fmt(commission)}</td>
      </tr>`
  }).join('')

  const dot = companyInfo.dot || companyInfo.DOT || ''
  const mc = companyInfo.mc || companyInfo.MC || ''
  const address = billing.address || companyInfo.address || ''
  const phone = billing.phone || companyInfo.phone || ''
  const email = billing.email || companyInfo.email || ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Dispatcher Settlement #${paymentNumber}</title>
</head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:820px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header: Logo + Title -->
  <div style="padding:28px 40px;background:#ffffff;border-bottom:2px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
    <div>${logoBlock(logoUrl, companyName)}</div>
    <div style="text-align:right;">
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.5px;">Dispatcher Settlement #${paymentNumber}</h1>
      <p style="margin:5px 0 0;font-size:13px;color:#6b7280;">Pay Date: ${fmtDate(payDate)}</p>
    </div>
  </div>

  <!-- Company + Dispatcher Info -->
  <div style="padding:28px 40px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;gap:24px;align-items:flex-start;">
    <!-- Company block -->
    <div style="flex:1;">
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:900;color:#111827;text-transform:uppercase;letter-spacing:-0.3px;">${companyName}</h2>
      ${dot || mc ? `<p style="margin:3px 0;font-size:13px;color:#374151;">${dot ? `DOT: <strong style="color:#111827;">${dot}</strong>` : ''}${dot && mc ? '&nbsp;&nbsp;&nbsp;' : ''}${mc ? `MC: <strong style="color:#111827;">${mc}</strong>` : ''}</p>` : ''}
      ${address ? `<p style="margin:3px 0;font-size:13px;color:#374151;">Address: <strong style="color:#111827;">${address}</strong></p>` : ''}
      ${phone ? `<p style="margin:3px 0;font-size:13px;color:#374151;">Phone: <strong style="color:#111827;">${phone}</strong></p>` : ''}
      ${email ? `<p style="margin:3px 0;font-size:13px;color:#374151;">Email: <strong style="color:#111827;">${email}</strong></p>` : ''}
    </div>
    <!-- Dispatcher block -->
    <div style="flex:0 0 290px;border:1.5px solid #d1d5db;border-radius:14px;padding:18px 20px;background:#ffffff;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#6b7280;white-space:nowrap;">Dispatcher:</td>
          <td style="padding:5px 0;font-size:13px;color:#111827;font-weight:800;text-align:right;padding-left:12px;">${dispatcherName.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#6b7280;white-space:nowrap;">Email:</td>
          <td style="padding:5px 0;font-size:12px;color:#374151;font-weight:600;text-align:right;padding-left:12px;">${dispatcherEmail}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#6b7280;white-space:nowrap;">Commission Rate:</td>
          <td style="padding:5px 0;font-size:13px;color:#ea580c;font-weight:800;text-align:right;padding-left:12px;">${commissionPct}%</td>
        </tr>
        ${periodStart ? `<tr>
          <td style="padding:5px 0;font-size:12px;color:#6b7280;white-space:nowrap;">Settlement Period:</td>
          <td style="padding:5px 0;font-size:12px;color:#111827;font-weight:600;text-align:right;padding-left:12px;">${fmtDate(periodStart)} – ${fmtDate(periodEnd)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#6b7280;white-space:nowrap;">Pay Date:</td>
          <td style="padding:5px 0;font-size:12px;color:#111827;font-weight:700;text-align:right;padding-left:12px;">${fmtDate(payDate)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Credits summary + Total Payout -->
  <div style="padding:24px 40px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:28px;">
    <div style="flex:1;background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:14px;padding:18px 20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#374151;">Revenue Type:</td>
          <td style="padding:5px 0;font-size:13px;color:#111827;font-weight:700;text-align:right;">Dispatcher</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#374151;">Sub-Total:</td>
          <td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;text-align:right;">${fmt(gross)}</td>
        </tr>
        <tr style="border-top:1.5px solid #d1d5db;">
          <td style="padding:10px 0 5px;font-size:14px;color:#16a34a;font-weight:800;">Total Credits:</td>
          <td style="padding:10px 0 5px;font-size:14px;color:#16a34a;font-weight:800;text-align:right;">${fmt(payout)}</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;min-width:150px;">
      <p style="margin:0 0 6px;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Total Payout</p>
      <div style="border-bottom:2.5px solid #111827;margin:0 auto 8px;width:130px;"></div>
      <p style="margin:0;font-size:32px;font-weight:900;color:#111827;letter-spacing:-1px;">${fmt(payout)}</p>
    </div>
  </div>

  <!-- Orders table -->
  <div style="padding:28px 40px 36px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f3f4f6;border-bottom:2px solid #d1d5db;">
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Load</th>
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">From / To</th>
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Date</th>
          <th style="padding:11px 10px;text-align:left;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Pay Breakdown</th>
          <th style="padding:11px 10px;text-align:right;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Gross</th>
          <th style="padding:11px 10px;text-align:right;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Commission</th>
        </tr>
      </thead>
      <tbody>
        ${ordersRows}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #111827;">
          <td colspan="5" style="padding:14px 10px;font-size:13px;color:#374151;font-weight:700;text-align:right;">Total Payout:</td>
          <td style="padding:14px 10px;font-size:16px;font-weight:900;color:#16a34a;text-align:right;">${fmt(payout)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:16px 40px;border-top:1px solid #e5e7eb;background:#f9fafb;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">${companyName} &mdash; Dispatcher Settlement &middot; Generated ${fmtDate(payDate)}</p>
    <p style="margin:4px 0 0;font-size:10px;color:#d1d5db;">This document is auto-generated and reflects commission based on loads dispatched during the stated period.</p>
  </div>

</div>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    type,
    paymentNumber,
    dispatcherEmail,
    dispatcherName,
    gross,
    commissionPct,
    payout,
    payDate,
    periodStart,
    periodEnd,
    orders = [],
    companyId,
  } = req.body

  if (!dispatcherEmail) return res.status(400).json({ error: 'Falta dispatcherEmail' })

  try {
    const { companyName, logoUrl, billing, companyInfo } = await getCompanyData(companyId)

    const html = dispatcherSettlementHtml({
      companyName, logoUrl, billing, companyInfo,
      paymentNumber, dispatcherName, dispatcherEmail,
      commissionPct, gross, payout,
      payDate, periodStart, periodEnd, orders,
    })

    // Preview mode: return HTML without sending
    if (req.body.action === 'preview') {
      return res.status(200).json({ success: true, html })
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: `${companyName} <noreply@etg-tms.com>`,
        to: [dispatcherEmail],
        subject: `Dispatcher Settlement #${paymentNumber} — ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(payout) || 0)}`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.json()
      return res.status(500).json({ error: `Resend error: ${err.message}` })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
