import { htmlToPdfBase64 } from './pdf'
import { downloadBase64Pdf } from './download'
import { getLogoUrl } from './company'
import { quarterRange } from './ifta'

// IFTA quarter report PDF — same plain statement style as the cycle report

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = n => { const v = Number(n) || 0; return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
const num = (n, d = 0) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const usDate = s => { const [y, m, d] = s.split('-'); return `${m}/${d}/${y}` }

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
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); margin: 18px 0 6px; border: 1px solid #e5e7eb; border-radius: 6px; }
  .summary > div { padding: 10px 12px; border-right: 1px solid #e5e7eb; }
  .summary > div:last-child { border-right: 0; }
  .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
  .val { font-size: 15px; font-weight: 700; margin-top: 2px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; margin: 22px 0 6px; color: #374151; }
  table { width: 100%; border-collapse: collapse; }
  th { white-space: nowrap; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 600; padding: 6px; border-bottom: 1px solid #d1d5db; }
  td { padding: 5px 6px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .cr { color: #047857; }
  tr.total td { border-top: 1px solid #111827; border-bottom: 0; font-weight: 700; }
  .note { font-size: 10px; color: #6b7280; margin-top: 4px; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; }
`

function buildHtml({ company, year, quarter, data, calc, filing, truckLabel }) {
  const info = company?.company_info || {}
  const companyName = info.company_name || info.dba || 'Empresa'
  const logo = company?.logo_path ? getLogoUrl(company.logo_path) : null
  const { from, to } = quarterRange(year, quarter)
  const truckName = id => data.trucks.find(t => t.id === id)?.name || '—'

  const stateRows = calc.rows.map(r => `
    <tr>
      <td>${esc(r.state)}${r.surcharge ? ' <span class="muted">recargo</span>' : ''}</td>
      <td class="num">${r.surcharge ? '' : num(r.miles)}</td>
      <td class="num">${num(r.taxableGallons, 2)}</td>
      <td class="num">${r.surcharge ? '' : num(r.paidGallons, 2)}</td>
      <td class="num">${num(r.netGallons, 2)}</td>
      <td class="num">${r.rate == null ? 'falta' : '$' + r.rate.toFixed(4)}</td>
      <td class="num ${(r.due || 0) < 0 ? 'cr' : ''}">${r.due == null ? '—' : money(r.due)}</td>
    </tr>`).join('')

  const truckRows = data.trucks.map(t => {
    const mi = calc.milesByTruck[t.id] || 0
    const gal = calc.gallonsByTruck[t.id] || 0
    return `<tr><td>${esc(t.name)}${t.number ? ` #${esc(t.number)}` : ''}</td><td class="num">${data.orders.filter(o => o.truck_id === t.id).length}</td><td class="num">${num(mi)}</td><td class="num">${num(gal, 1)}</td><td class="num">${gal ? (mi / gal).toFixed(2) : '—'}</td></tr>`
  }).join('')

  const alerts = [
    ...calc.warnings.map(o => `Orden #${esc(o.order_number)} (${esc(truckName(o.truck_id))}): ${esc(o.state_miles.warnings.join('; '))}. Se usaron las millas de la ruta.`),
    ...calc.fuelIssues.map(f => `Diesel ${esc(f.date)} (${esc(truckName(f.truck_id))}${f.invoice_number ? `, factura ${esc(f.invoice_number)}` : ''}): ${esc(f.problem)}.`),
  ]

  return `<html><body><div class="doc"><style>${CSS}</style>
    <div class="head">
      <div class="co">
        ${logo ? `<img src="${esc(logo)}" crossorigin="anonymous" />` : ''}
        <div>
          <div class="co-name">${esc(companyName)}</div>
          <div class="muted">${[info.mc_number && `MC# ${esc(info.mc_number)}`, info.dot_number && `DOT# ${esc(info.dot_number)}`].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div class="title">
        <h1>REPORTE IFTA</h1>
        <div><b>Q${quarter} ${year}</b></div>
        ${truckLabel ? `<div><b>${esc(truckLabel)}</b></div><div class="muted">Estimado de este camión — la declaración oficial es la de toda la flota</div>` : ''}
        <div class="muted">${usDate(from)} — ${usDate(to)}</div>
        ${filing ? `<div class="muted">Declarado el ${new Date(filing.filed_at).toLocaleDateString('es-MX')}</div>` : ''}
      </div>
    </div>

    <div class="summary">
      <div><div class="lbl">Millas totales</div><div class="val">${num(calc.totalMiles)}</div></div>
      <div><div class="lbl">Galones</div><div class="val">${num(calc.totalGallons, 1)}</div></div>
      <div><div class="lbl">MPG flota</div><div class="val">${calc.mpg ? calc.mpg.toFixed(2) : '—'}</div></div>
      <div><div class="lbl">Impuesto total</div><div class="val ${calc.totalDue < 0 ? 'cr' : ''}">${money(calc.totalDue)}</div></div>
    </div>
    <div class="note">Camiones dry van marcados para IFTA: ${data.trucks.length}. Millas por estado calculadas con la ruta de cada orden (HERE Maps), cargadas y vacías.</div>

    <h2>Por estado</h2>
    <table>
      <thead><tr><th>Estado</th><th class="num">Millas</th><th class="num">Gal. consumidos</th><th class="num">Gal. comprados</th><th class="num">Gal. netos</th><th class="num">Tasa</th><th class="num">Impuesto</th></tr></thead>
      <tbody>${stateRows}
        <tr class="total"><td>Total</td><td class="num">${num(calc.totalMiles)}</td><td colspan="4"></td><td class="num">${money(calc.totalDue)}</td></tr>
      </tbody>
    </table>
    <div class="note">Positivo = se le debe al estado · negativo = crédito a favor. Galones consumidos = millas del estado ÷ MPG de la flota. Tasas oficiales IFTA, Inc. (diesel) del trimestre.</div>

    <h2>Por camión</h2>
    <table>
      <thead><tr><th>Camión</th><th class="num">Órdenes</th><th class="num">Millas</th><th class="num">Galones</th><th class="num">MPG</th></tr></thead>
      <tbody>${truckRows}</tbody>
    </table>

    ${alerts.length ? `<h2>Para revisar</h2><table><tbody>${alerts.map(a => `<tr><td>${a}</td></tr>`).join('')}</tbody></table>` : ''}

    <div class="foot"><span>${esc(companyName)} · IFTA Q${quarter} ${year}</span><span>Generado el ${esc(new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }))}</span></div>
  </div></body></html>`
}

export async function downloadIftaReport(args) {
  const base64 = await htmlToPdfBase64(buildHtml(args), { containerWidth: 900 })
  const safe = String(args.company?.company_info?.company_name || 'Empresa').replace(/[^\w-]+/g, '_')
  const truck = args.truckLabel ? `_${String(args.truckLabel).replace(/[^\w-]+/g, '_')}` : ''
  downloadBase64Pdf(base64, `IFTA_${safe}${truck}_Q${args.quarter}_${args.year}.pdf`)
}
