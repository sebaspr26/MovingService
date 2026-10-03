import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../context/CompanyContext'
import { useAuth } from '../context/AuthContext'
import { hasFeature } from '../lib/company'
import { loadQuarterData, computeQuarter, fillStateMiles, quarterRange } from '../lib/ifta'
import { ratesFor, IFTA_DIESEL_RATES } from '../lib/iftaRates'
import { downloadIftaReport } from '../lib/iftaReport'
import { downloadIftaExcel } from '../lib/iftaExcel'
import { useToast } from './Toast'

// IFTA (International Fuel Tax Agreement) — super admin only, and only for
// companies that turned the module on in Configuración. One card per quarter
// (like Vektor): tax due/credit, top states, status, detail and PDF.

const fmtMoney = n => {
  const v = Number(n) || 0
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const fmtNum = (n, d = 0) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const shortDate = s => { const [y, m, d] = s.split('-'); return `${m}/${d}/${y.slice(2)}` }
const SLICE_COLORS = ['#1e3a8a', '#2563eb', '#60a5fa', '#93c5fd', '#cbd5e1']

const YEARS = [...new Set(Object.keys(IFTA_DIESEL_RATES).map(k => Number(k.slice(2))))].sort((a, b) => b - a)

function quartersOf(year) {
  const now = new Date()
  const currentQ = Math.floor(now.getMonth() / 3) + 1
  const last = year < now.getFullYear() ? 4 : year > now.getFullYear() ? 0 : currentQ
  return Array.from({ length: last }, (_, i) => i + 1).reverse()
}

export default function Ifta() {
  const { activeCompany, loading } = useCompany()
  const [year, setYear] = useState(YEARS[0] || new Date().getFullYear())
  const [detail, setDetail] = useState(null)
  // Bumped after "Calcular todo" so every card reloads its numbers
  const [version, setVersion] = useState(0)
  const [bulk, setBulk] = useState(null)
  const toast = useToast()

  // State miles for every quarter of the year in one go, one quarter at a time
  async function handleFillYear() {
    setBulk({ done: 0, total: 0, label: 'Buscando órdenes...' })
    try {
      const loaded = []
      for (const q of quartersOf(year)) loaded.push(await loadQuarterData(activeCompany.id, year, q))
      const total = loaded.reduce((s, d) => s + d.orders.filter(o => o.needsMiles).length, 0)
      if (!total) { toast.success(`Todos los trimestres de ${year} ya tienen las millas calculadas`); return }
      let doneBefore = 0
      const failed = []
      for (const d of loaded) {
        const pending = d.orders.filter(o => o.needsMiles).length
        if (!pending) continue
        const res = await fillStateMiles(d.orders, done => setBulk({ done: doneBefore + done, total, label: `Q${d.quarter} ${year}` }))
        failed.push(...res.failed)
        doneBefore += pending
      }
      if (failed.length) toast.warning(`No se pudo calcular la ruta de ${failed.length} orden(es): ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '...' : ''}`)
      else toast.success(`Millas por estado de ${year} calculadas (${total} órdenes)`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBulk(null)
      setVersion(v => v + 1)
    }
  }

  if (!loading && !hasFeature(activeCompany, 'ifta')) {
    return (
      <div className="animate-tab-in max-w-md mx-auto text-center pt-16">
        <h1 className="text-xl font-bold text-white">IFTA no está activado</h1>
        <p className="text-sm text-gray-500 mt-2">Este módulo se activa por empresa. Actívalo para esta empresa en Configuración.</p>
        <Link to="/settings" className="inline-block mt-5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">Ir a Configuración</Link>
      </div>
    )
  }
  if (!activeCompany) return null

  const quarters = quartersOf(year)

  return (
    <div className="animate-tab-in">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">IFTA</h1>
          <p className="text-sm text-gray-500 mt-0.5">Impuesto de combustible por estado · camiones marcados como dry van</p>
        </div>
        <div className="flex items-center gap-3">
        {bulk ? (
          <div className="w-56">
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{ width: `${bulk.total ? (bulk.done / bulk.total) * 100 : 5}%` }} /></div>
            <p className="text-[11px] text-gray-500 mt-1">{bulk.total ? `${bulk.label}: ${bulk.done} de ${bulk.total} órdenes...` : bulk.label}</p>
          </div>
        ) : (
          <button onClick={handleFillYear} disabled={!activeCompany} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 disabled:opacity-50">
            Calcular todo {year}
          </button>
        )}
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Año
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="sel bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        </div>
      </div>

      {quarters.length === 0 ? (
        <p className="text-sm text-gray-500">No hay trimestres para este año todavía.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {quarters.map(q => (
            <QuarterCard key={`${activeCompany.id}-${year}-${q}-${version}`} company={activeCompany} year={year} quarter={q} onOpen={setDetail} />
          ))}
        </div>
      )}

      {detail && <QuarterDetail {...detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function useQuarter(companyId, year, quarter) {
  const [state, setState] = useState({ loading: true })
  const reload = useCallback(async () => {
    try {
      const [data, { data: filing }] = await Promise.all([
        loadQuarterData(companyId, year, quarter),
        supabase.from('ifta_filings').select('*').eq('company_id', companyId).eq('year', year).eq('quarter', quarter).maybeSingle(),
      ])
      const rates = ratesFor(year, quarter)
      setState({ loading: false, data, calc: computeQuarter(data, rates), rates, filing })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }, [companyId, year, quarter])
  useEffect(() => { reload() }, [reload])
  return [state, reload]
}

function QuarterCard({ company, year, quarter, onOpen }) {
  const toast = useToast()
  const [{ loading, error, data, calc, rates, filing }, reload] = useQuarter(company.id, year, quarter)
  const [progress, setProgress] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const { from, to } = quarterRange(year, quarter)

  async function handleFill() {
    setProgress({ done: 0, total: calc.pendingOrders.length })
    try {
      const { failed } = await fillStateMiles(data.orders, (done, total) => setProgress({ done, total }))
      if (failed.length) toast.warning(`No se pudo calcular la ruta de ${failed.length} orden(es): ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '...' : ''}`)
      else toast.success('Millas por estado calculadas')
    } finally {
      setProgress(null)
      reload()
    }
  }

  function handleExcel() {
    try {
      downloadIftaExcel({ company, year, quarter, data, calc })
    } catch (err) {
      toast.error('No se pudo generar el Excel: ' + err.message)
    }
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadIftaReport({ company, year, quarter, data, calc, filing })
    } catch (err) {
      toast.error('No se pudo generar el reporte: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  const status = filing ? 'filed' : !calc ? null : !data.trucks.length ? 'empty' : calc.ready ? 'ready' : 'incomplete'
  const badge = {
    filed: { label: 'Declarado', cls: 'bg-blue-600/15 text-blue-400 border-blue-600/30' },
    ready: { label: 'Listo', cls: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/30' },
    incomplete: { label: 'Incompleto', cls: 'bg-amber-600/15 text-amber-400 border-amber-600/30' },
    empty: { label: 'Sin camiones', cls: 'bg-gray-700/40 text-gray-400 border-gray-600/40' },
  }[status]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-4">
        <p className="text-sm font-semibold text-white">
          Q{quarter} {year} <span className="font-normal text-gray-500">({shortDate(from)} - {shortDate(to)})</span>
        </p>
        {badge && <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border ${badge.cls}`}>{badge.label}</span>}
      </div>

      <div className="flex-1 min-h-[180px]">
        {loading ? (
          <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !data.trucks.length ? (
          <p className="text-sm text-gray-500 text-center pt-10">No hay camiones marcados como dry van (IFTA).<br /><span className="text-xs text-gray-600">Dashboard → editar camión → "Incluir en IFTA"</span></p>
        ) : !rates ? (
          <p className="text-sm text-gray-500 text-center pt-10">Faltan las tasas oficiales de este trimestre.</p>
        ) : calc.pendingOrders.length ? (
          <div className="text-center pt-6">
            <p className="text-sm text-gray-300">Faltan las millas por estado de <b>{calc.pendingOrders.length}</b> de {data.orders.length} órdenes</p>
            <p className="text-xs text-gray-600 mt-1">Se calculan con la ruta de cada orden (HERE Maps)</p>
            {progress ? (
              <div className="mt-4 max-w-xs mx-auto">
                <div className="h-2 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div>
                <p className="text-xs text-gray-500 mt-1.5">{progress.done} de {progress.total}...</p>
              </div>
            ) : (
              <button onClick={handleFill} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">Calcular millas</button>
            )}
          </div>
        ) : calc.mpg == null ? (
          <p className="text-sm text-gray-500 text-center pt-10">No hay diesel con galones registrado en este trimestre.</p>
        ) : (
          <QuarterSummary calc={calc} />
        )}
      </div>

      {!loading && !error && data?.trucks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800 flex gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading || !calc?.mpg || !!calc?.pendingOrders.length}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            {downloading ? 'Generando...' : 'PDF'}
          </button>
          <button
            onClick={handleExcel}
            disabled={!calc?.mpg || !!calc?.pendingOrders.length}
            title="Excel con las fórmulas, cada orden y cada carga de diesel, para verificar el cálculo"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-700/50 text-sm text-emerald-300 hover:bg-emerald-600/10 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" /></svg>
            Excel
          </button>
          <button
            onClick={() => onOpen({ company, year, quarter, data, calc, filing, rates, onChanged: reload })}
            disabled={!calc}
            title="Ver detalle"
            className="px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function topStates(calc) {
  // Net due per base state (surcharges merged), biggest first, rest as "Otros"
  const byState = {}
  for (const r of calc.rows) byState[r.state] = (byState[r.state] || 0) + (r.due || 0)
  const sorted = Object.entries(byState).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const top = sorted.slice(0, 4)
  const rest = sorted.slice(4).reduce((s, [, v]) => s + v, 0)
  const items = top.map(([state, due]) => ({ state, due }))
  if (sorted.length > 4) items.push({ state: 'Otros', due: rest })
  const absTotal = items.reduce((s, i) => s + Math.abs(i.due), 0) || 1
  return items.map(i => ({ ...i, pct: Math.round((Math.abs(i.due) / absTotal) * 100) }))
}

function Donut({ items, total }) {
  const R = 52, C = 2 * Math.PI * R, GAP = 4
  // Start of each slice along the circle
  const starts = items.map((_, i) => items.slice(0, i).reduce((s, it) => s + (it.pct / 100) * C, 0))
  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0">
      <circle cx="70" cy="70" r={R} fill="none" stroke="#1f2937" strokeWidth="10" />
      {items.map((it, i) => {
        const len = Math.max((it.pct / 100) * C - GAP, 0)
        return (
          <circle key={it.state} cx="70" cy="70" r={R} fill="none" stroke={SLICE_COLORS[i % SLICE_COLORS.length]} strokeWidth="10"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-starts[i]} strokeLinecap="round" transform="rotate(-90 70 70)" />
        )
      })}
      <text x="70" y="64" textAnchor="middle" className="fill-gray-500" style={{ fontSize: 9 }}>Impuesto total</text>
      <text x="70" y="82" textAnchor="middle" className="fill-white" style={{ fontSize: 15, fontWeight: 700 }}>{fmtMoney(total)}</text>
    </svg>
  )
}

function QuarterSummary({ calc }) {
  const items = topStates(calc)
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <Donut items={items} total={calc.totalDue} />
      <div className="flex-1 w-full space-y-1.5">
        {items.map((it, i) => (
          <div key={it.state} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
            <span className="w-14 text-gray-300">{it.state}</span>
            <span className={`flex-1 text-right font-medium tabular-nums ${it.due < 0 ? 'text-emerald-400' : 'text-gray-100'}`}>{fmtMoney(it.due)}</span>
            <span className="w-10 text-right text-xs text-gray-500 tabular-nums">{it.pct}%</span>
          </div>
        ))}
        <p className="text-[11px] text-gray-600 pt-1">{fmtNum(calc.totalMiles)} mi · {fmtNum(calc.totalGallons, 1)} gal · {calc.mpg.toFixed(2)} MPG</p>
        {(calc.warnings.length > 0 || calc.fuelIssues.length > 0) && (
          <p className="text-[11px] text-amber-400">⚠ {calc.warnings.length + calc.fuelIssues.length} alerta(s) para revisar en el detalle</p>
        )}
      </div>
    </div>
  )
}

function QuarterDetail({ company, year, quarter, data, calc, filing, onChanged, onClose }) {
  const toast = useToast()
  const { session } = useAuth()
  const [saving, setSaving] = useState(false)
  const truckName = id => data.trucks.find(t => t.id === id)?.name || '—'

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function toggleFiled() {
    setSaving(true)
    try {
      if (filing) {
        const ok = await toast.confirm(`¿Quitar la marca de declarado de Q${quarter} ${year}?`)
        if (!ok) return
        const { error } = await supabase.from('ifta_filings').delete().eq('id', filing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ifta_filings').insert({
          company_id: company.id, year, quarter, status: 'filed',
          filed_by: session?.user?.user_metadata?.name || session?.user?.email || null,
          totals: { totalDue: calc.totalDue, totalMiles: calc.totalMiles, totalGallons: calc.totalGallons, mpg: calc.mpg, rows: calc.rows },
        })
        if (error) throw error
      }
      onChanged?.()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const filedDiffers = filing?.totals && Math.abs((filing.totals.totalDue || 0) - calc.totalDue) > 0.01

  return createPortal(
    <div className="fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-800">
          <div>
            <p className="text-sm font-semibold text-white">IFTA Q{quarter} {year}</p>
            <p className="text-xs text-gray-500">{fmtNum(calc.totalMiles)} mi · {fmtNum(calc.totalGallons, 1)} gal · {calc.mpg ? `${calc.mpg.toFixed(2)} MPG` : 'sin MPG'} · Total {fmtMoney(calc.totalDue)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleFiled} disabled={saving || !calc.mpg} className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${filing ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
              {filing ? 'Quitar "declarado"' : 'Marcar como declarado'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto overscroll-none p-5 space-y-6">
          {filing && (
            <p className={`text-xs rounded-lg px-3 py-2 ${filedDiffers ? 'bg-amber-900/30 text-amber-300' : 'bg-blue-900/20 text-blue-300'}`}>
              Declarado el {new Date(filing.filed_at).toLocaleDateString('es-MX')}{filing.filed_by ? ` por ${filing.filed_by}` : ''} con un total de {fmtMoney(filing.totals?.totalDue)}.
              {filedDiffers && ` Los datos cambiaron después de declararlo: hoy da ${fmtMoney(calc.totalDue)}.`}
            </p>
          )}

          <section>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Por estado</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-[11px] uppercase text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-3">Estado</th><th className="text-right pr-3">Millas</th><th className="text-right pr-3">Gal. consumidos</th>
                  <th className="text-right pr-3">Gal. comprados</th><th className="text-right pr-3">Gal. netos</th><th className="text-right pr-3">Tasa</th><th className="text-right">Impuesto</th>
                </tr></thead>
                <tbody>
                  {calc.rows.map(r => (
                    <tr key={r.state} className="border-b border-gray-800/60">
                      <td className="py-1.5 pr-3 text-gray-200">{r.state}{r.surcharge && <span className="text-[10px] text-gray-500"> recargo</span>}</td>
                      <td className="text-right pr-3 tabular-nums text-gray-300">{r.surcharge ? '' : fmtNum(r.miles)}</td>
                      <td className="text-right pr-3 tabular-nums text-gray-300">{fmtNum(r.taxableGallons, 2)}</td>
                      <td className="text-right pr-3 tabular-nums text-gray-300">{r.surcharge ? '' : fmtNum(r.paidGallons, 2)}</td>
                      <td className="text-right pr-3 tabular-nums text-gray-300">{fmtNum(r.netGallons, 2)}</td>
                      <td className="text-right pr-3 tabular-nums text-gray-400">{r.rate == null ? <span className="text-red-400">falta</span> : `$${r.rate.toFixed(4)}`}</td>
                      <td className={`text-right tabular-nums font-medium ${(r.due || 0) < 0 ? 'text-emerald-400' : 'text-gray-100'}`}>{r.due == null ? '—' : fmtMoney(r.due)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-gray-100">
                    <td className="py-2 pr-3">Total</td><td className="text-right pr-3 tabular-nums">{fmtNum(calc.totalMiles)}</td><td colSpan={4} />
                    <td className="text-right tabular-nums">{fmtMoney(calc.totalDue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-600 mt-2">Positivo = se le debe al estado · negativo = crédito a favor. Galones consumidos = millas del estado ÷ MPG de la flota.</p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Por camión</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase text-gray-500 border-b border-gray-800">
                <th className="text-left py-2">Camión</th><th className="text-right">Órdenes</th><th className="text-right">Millas</th><th className="text-right">Galones</th><th className="text-right">MPG</th>
              </tr></thead>
              <tbody>
                {data.trucks.map(t => {
                  const mi = calc.milesByTruck[t.id] || 0
                  const gal = calc.gallonsByTruck[t.id] || 0
                  return (
                    <tr key={t.id} className="border-b border-gray-800/60">
                      <td className="py-1.5 text-gray-200">{t.name}{t.number ? ` #${t.number}` : ''}</td>
                      <td className="text-right tabular-nums text-gray-300">{data.orders.filter(o => o.truck_id === t.id).length}</td>
                      <td className="text-right tabular-nums text-gray-300">{fmtNum(mi)}</td>
                      <td className="text-right tabular-nums text-gray-300">{fmtNum(gal, 1)}</td>
                      <td className={`text-right tabular-nums ${gal && (mi / gal < 4 || mi / gal > 9) ? 'text-amber-400' : 'text-gray-300'}`}>{gal ? (mi / gal).toFixed(2) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-600 mt-2">Un MPG fuera de 4–9 (en amarillo) suele indicar diesel o millas sin registrar en ese camión.</p>
          </section>

          {(calc.warnings.length > 0 || calc.fuelIssues.length > 0) && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-amber-400 font-semibold mb-2">Para revisar</h3>
              <ul className="space-y-1.5 text-xs">
                {calc.warnings.map(o => (
                  <li key={o.id} className="text-gray-300"><span className="text-amber-400">Orden #{o.order_number}</span> ({truckName(o.truck_id)}): {o.state_miles.warnings.join('; ')}. Se usaron las millas de la ruta.</li>
                ))}
                {calc.fuelIssues.map(f => (
                  <li key={f.id} className="text-gray-300"><span className="text-amber-400">Diesel {f.date}</span> ({truckName(f.truck_id)}{f.invoice_number ? `, factura ${f.invoice_number}` : ''}{f.city ? `, ${f.city}` : ''}): {f.problem}{!Number(f.gallons) ? ' — no cuenta en el cálculo' : ' — cuenta para el MPG pero no como compra en un estado'}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
