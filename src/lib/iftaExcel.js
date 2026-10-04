import { buildXlsx, downloadBlobFile } from './xlsx'
import { quarterRange, stateOfCity } from './ifta'

// IFTA quarter workbook for checking the numbers by hand. Every figure in
// "Resumen" and "Por estado" is a formula over the raw rows in "Ordenes" and
// "Diesel", so Excel shows (and recomputes) exactly how each one is built; the
// app's own result sits next to it to compare.

const r2 = n => Math.round((Number(n) || 0) * 100) / 100

export function downloadIftaExcel({ company, year, quarter, data, calc, truckLabel }) {
  const companyName = company?.company_info?.company_name || company?.display_name || 'Empresa'
  const { from, to } = quarterRange(year, quarter)
  const truckName = id => data.trucks.find(t => t.id === id)?.name || ''

  // ── Ordenes: one row per order x leg (loaded/empty) x state ──
  const ordenes = [[
    { v: 'Orden', style: 'header' }, { v: 'Camión', style: 'header' }, { v: 'Fecha PU', style: 'header' },
    { v: 'Ciudad PU', style: 'header' }, { v: 'Ciudad DO', style: 'header' }, { v: 'Millas registradas', style: 'header' },
    { v: 'Vacías registradas', style: 'header' }, { v: 'Vacías desde', style: 'header' }, { v: 'Tramo', style: 'header' },
    { v: 'Estado', style: 'header' }, { v: 'Millas', style: 'header' }, { v: 'Alerta', style: 'header' },
  ]]
  for (const o of data.orders) {
    const base = [o.order_number, truckName(o.truck_id), o.pu_date, o.pu_city || '', o.do_city || '',
      { v: Number(o.miles) || 0, style: 'num' }, { v: Number(o.dead_miles) || 0, style: 'num' }, o.prevDoCity || '']
    const alert = (o.state_miles?.warnings || []).join('; ')
    if (!o.state_miles) {
      ordenes.push([...base, 'Sin calcular', '', '', 'Faltan las millas por estado de esta orden'])
      continue
    }
    for (const [leg, label] of [['loaded', 'Cargada'], ['empty', 'Vacía']]) {
      for (const [st, mi] of Object.entries(o.state_miles[leg] || {})) {
        ordenes.push([...base, label, st, { v: mi, style: 'num1' }, alert])
      }
    }
  }

  // ── Diesel: every purchase of the quarter ──
  const diesel = [[
    { v: 'Fecha', style: 'header' }, { v: 'Camión', style: 'header' }, { v: 'Factura', style: 'header' },
    { v: 'Ciudad', style: 'header' }, { v: 'Estado', style: 'header' }, { v: 'Galones', style: 'header' },
    { v: 'Valor', style: 'header' }, { v: 'Problema', style: 'header' },
  ]]
  const problemById = Object.fromEntries(calc.fuelIssues.map(f => [f.id, f.problem]))
  for (const f of [...data.diesel].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    diesel.push([f.date, truckName(f.truck_id), f.invoice_number || '', f.city || '', stateOfCity(f.city) || '',
      { v: Number(f.gallons) || 0, style: 'num2' }, { v: Number(f.value) || 0, style: 'money' }, problemById[f.id] || ''])
  }

  // ── Resumen (MPG lives in B6, referenced by "Por estado") ──
  const totalRow = calc.rows.length + 2 // header + rows + total
  const resumen = [
    [{ v: 'Reporte IFTA', style: 'bold' }],
    ['Empresa', companyName],
    ['Trimestre', `Q${quarter} ${year} (${from} a ${to})`],
    ['Millas totales', { f: 'SUM(Ordenes!K:K)', v: r2(calc.totalMiles), style: 'num' }],
    ['Galones totales', { f: 'SUM(Diesel!F:F)', v: r2(calc.totalGallons), style: 'num2' }],
    ['MPG de la flota', { f: 'IF(B5>0,B4/B5,0)', v: calc.mpg ? Math.round(calc.mpg * 10000) / 10000 : 0, style: 'num4' }],
    ['Impuesto total', { f: `'Por estado'!G${totalRow}`, v: r2(calc.totalDue), style: 'moneyBold' }],
    ['Impuesto total (app)', { v: r2(calc.totalDue), style: 'money' }],
    [],
    [{ v: 'Cómo se calcula', style: 'bold' }],
    ['1', 'Millas por estado de cada orden (hoja Ordenes): ruta HERE de la orden repartida por estado, ajustada a las millas registradas (cargadas) y vacías desde el delivery anterior del camión.'],
    ['2', 'Millas totales = suma de la columna Millas de Ordenes (B4).'],
    ['3', 'Galones totales = suma de los galones de la hoja Diesel (B5). Las cargas sin estado cuentan para el MPG.'],
    ['4', 'MPG de la flota = millas totales / galones totales (B6).'],
    ['5', 'Por estado: galones consumidos = millas del estado / MPG; netos = consumidos - comprados en ese estado; impuesto = netos x tasa.'],
    ['6', 'Recargos (KY*, VA*): galones consumidos x tasa del recargo, sin restar lo comprado.'],
    ['7', 'Impuesto total = suma de la columna Impuesto de Por estado. Positivo = se paga; negativo = crédito.'],
    ['', 'Tasas: tabla oficial de IFTA, Inc. del trimestre (iftach.org).'],
  ]

  // ── Por estado: formulas over Ordenes / Diesel ──
  const porEstado = [[
    { v: 'Estado', style: 'header' }, { v: 'Millas', style: 'header' }, { v: 'Gal. consumidos', style: 'header' },
    { v: 'Gal. comprados', style: 'header' }, { v: 'Gal. netos', style: 'header' }, { v: 'Tasa', style: 'header' },
    { v: 'Impuesto', style: 'header' }, { v: 'Impuesto (app)', style: 'header' },
  ]]
  calc.rows.forEach((r, i) => {
    const row = i + 2
    const base = r.surcharge ? r.state.replace('*', '') : r.state
    porEstado.push(r.surcharge
      ? [
          `${r.state} (recargo)`,
          '',
          { f: `SUMIF(Ordenes!J:J,"${base}",Ordenes!K:K)/Resumen!$B$6`, v: r2(r.taxableGallons), style: 'num2' },
          { v: 0, style: 'num2' },
          { f: `C${row}-D${row}`, v: r2(r.netGallons), style: 'num2' },
          { v: r.rate, style: 'num4' },
          { f: `E${row}*F${row}`, v: r2(r.due), style: 'money' },
          { v: r2(r.due), style: 'money' },
        ]
      : [
          r.state,
          { f: `SUMIF(Ordenes!J:J,A${row},Ordenes!K:K)`, v: r2(r.miles), style: 'num1' },
          { f: `B${row}/Resumen!$B$6`, v: r2(r.taxableGallons), style: 'num2' },
          { f: `SUMIF(Diesel!E:E,A${row},Diesel!F:F)`, v: r2(r.paidGallons), style: 'num2' },
          { f: `C${row}-D${row}`, v: r2(r.netGallons), style: 'num2' },
          r.rate == null ? 'falta' : { v: r.rate, style: 'num4' },
          r.rate == null ? '' : { f: `E${row}*F${row}`, v: r2(r.due), style: 'money' },
          r.due == null ? '' : { v: r2(r.due), style: 'money' },
        ])
  })
  porEstado.push([
    { v: 'Total', style: 'bold' },
    { f: `SUM(B2:B${totalRow - 1})`, v: r2(calc.totalMiles), style: 'num' },
    '', '', '', '',
    { f: `SUM(G2:G${totalRow - 1})`, v: r2(calc.totalDue), style: 'moneyBold' },
    { v: r2(calc.totalDue), style: 'moneyBold' },
  ])

  // At the end so the formulas above (B4, B5...) keep their cells
  if (truckLabel) resumen.push([], ['Camión', `${truckLabel} — estimado de este camión; la declaración oficial es la de toda la flota`])
  const blob = buildXlsx([
    { name: 'Resumen', columns: [{ width: 22 }, { width: 70 }], rows: resumen },
    { name: 'Por estado', columns: [{ width: 16 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 16 }], rows: porEstado, freezeHeader: true },
    { name: 'Ordenes', columns: [{ width: 16 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 22 }, { width: 12 }, { width: 12 }, { width: 22 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 50 }], rows: ordenes, freezeHeader: true },
    { name: 'Diesel', columns: [{ width: 12 }, { width: 14 }, { width: 14 }, { width: 24 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 24 }], rows: diesel, freezeHeader: true },
  ])
  const safe = companyName.replace(/[^\w-]+/g, '_')
  const truck = truckLabel ? `_${String(truckLabel).replace(/[^\w-]+/g, '_')}` : ''
  downloadBlobFile(blob, `IFTA_${safe}${truck}_Q${quarter}_${year}.xlsx`)
  return blob
}
