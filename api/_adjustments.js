// Shared by send-settlement.js and send-driver-settlement.js (the leading _ keeps
// Vercel from exposing it as an endpoint). Payment adjustments: debts deducted
// from the settlement ('deduct') and extra income added to it ('add'). See
// supabase/042_payment_adjustments.sql.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function cleanAdjustments(list) {
  if (!Array.isArray(list)) return []
  return list
    .map(a => ({ type: a?.type === 'add' ? 'add' : 'deduct', description: String(a?.description || '').slice(0, 120), amount: Math.abs(Number(a?.amount) || 0) }))
    .filter(a => a.amount > 0)
}

export const adjustmentsNet = list => list.reduce((s, a) => s + (a.type === 'add' ? a.amount : -a.amount), 0)

const label = a => esc(a.description || (a.type === 'add' ? 'Additional income' : 'Deduction'))
const signed = (a, fmt) => `${a.type === 'add' ? '+' : '−'}${fmt(a.amount)}`
const color = a => (a.type === 'add' ? '#16a34a' : '#dc2626')

/** Rows for the summary box of the PDF: earned -> each adjustment (no total). */
export function adjustmentSummaryRows(list, fmt) {
  return list.map(a => `
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#374151;">${a.type === 'add' ? 'Addition' : 'Deduction'}: ${label(a)}</td>
          <td style="padding:5px 0;font-size:13px;color:${color(a)};font-weight:700;text-align:right;">${signed(a, fmt)}</td>
        </tr>`).join('')
}

/** A small table under the loads listing every adjustment, for the PDF. */
export function adjustmentsTableHtml(list, fmt, earned, payout) {
  if (!list.length) return ''
  return `
  <div style="padding:0 40px 32px;">
    <p style="margin:0 0 10px;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Adjustments</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:9px 10px;font-size:13px;color:#374151;">Earned from loads</td>
        <td style="padding:9px 10px;font-size:13px;color:#111827;font-weight:700;text-align:right;">${fmt(earned)}</td>
      </tr>
      ${list.map(a => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:9px 10px;font-size:13px;color:#374151;">${a.type === 'add' ? 'Addition' : 'Deduction'}: ${label(a)}</td>
        <td style="padding:9px 10px;font-size:13px;color:${color(a)};font-weight:700;text-align:right;">${signed(a, fmt)}</td>
      </tr>`).join('')}
      <tr style="border-top:2px solid #111827;">
        <td style="padding:12px 10px;font-size:13px;color:#374151;font-weight:700;">Total Payout</td>
        <td style="padding:12px 10px;font-size:16px;font-weight:900;color:#16a34a;text-align:right;">${fmt(payout)}</td>
      </tr>
    </table>
  </div>`
}

/** Rows for the short email body (table-based layout). */
export function adjustmentEmailRows(list, fmt) {
  return list.map(a => `
          <tr>
            <td style="padding:12px 20px;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#6b7280;">${a.type === 'add' ? 'Addition' : 'Deduction'}: ${label(a)}</td>
                  <td align="right" style="font-size:13px;color:${color(a)};font-weight:800;">${signed(a, fmt)}</td>
                </tr>
              </table>
            </td>
          </tr>`).join('')
}

export function adjustmentTextLines(list, fmt) {
  return list.map(a => `${a.type === 'add' ? 'Addition' : 'Deduction'}: ${a.description || '-'}  ${signed(a, fmt)}`)
}
