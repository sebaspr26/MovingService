import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../context/CompanyContext'
import { useAuth } from '../context/AuthContext'
import { hasFeature } from '../lib/company'
import { loadQuarterData, computeQuarter, fillStateMiles, quarterRange, loadedPlaces, stateOfCity, loadIftaFleet, onlyTruck } from '../lib/ifta'
import { receiptUrl, isPdfReceipt } from '../lib/receipts'
import { ratesFor, IFTA_DIESEL_RATES } from '../lib/iftaRates'
import { downloadIftaReport } from '../lib/iftaReport'
import { downloadIftaExcel } from '../lib/iftaExcel'
import { useToast } from './Toast'
import OrderDetail from './OrderDetail'
import PdfViewer from './PdfViewer'

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

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const longDate = s => { const [y, m, d] = s.split('-').map(Number); return `${d} de ${MONTHS[m - 1]} ${y}` }
const todayStr = () => new Date().toLocaleDateString('en-CA')

// From the first year with rates up to the current one: a new year appears on
// its own on January 1st (its rates still have to be added to iftaRates.js)
const FIRST_YEAR = Math.min(...Object.keys(IFTA_DIESEL_RATES).map(k => Number(k.slice(2))))
const YEARS = Array.from({ length: Math.max(new Date().getFullYear() - FIRST_YEAR + 1, 1) }, (_, i) => FIRST_YEAR + i).reverse()
// In January the quarter left to declare is last year's Q4 (due Jan 31)
const DEFAULT_YEAR = new Date().getMonth() === 0 ? Math.max(new Date().getFullYear() - 1, FIRST_YEAR) : new Date().getFullYear()

/** Quarters of `year` that have already started (the ones with data). */
function quartersOf(year) {
  const now = new Date()
  const currentQ = Math.floor(now.getMonth() / 3) + 1
  const last = year < now.getFullYear() ? 4 : year > now.getFullYear() ? 0 : currentQ
  return Array.from({ length: last }, (_, i) => i + 1)
}

/** Return due date: last day of the month after the quarter ends. */
function dueDate(year, quarter) {
  const d = new Date(year, quarter * 3 + 1, 0)
  return d.toLocaleDateString('en-CA')
}

// Name shown for a truck: its driver (what people call it), else the truck
const truckTitle = t => t ? (t.driver || t.name) : '—'
const sameName = t => t.driver && t.driver.trim().toUpperCase() === String(t.name || '').trim().toUpperCase()
const truckSub = t => [!sameName(t) && t.driver ? t.name : null, t.number ? `#${t.number}` : null].filter(Boolean).join(' ')
const truckFull = t => t ? [truckTitle(t), truckSub(t)].filter(Boolean).join(' · ') : '—'

function TruckTabs({ fleet, value, onChange }) {
  if (fleet.length < 2) return null
  const tabs = [{ id: null, label: 'General', sub: `${fleet.length} camiones` }, ...fleet.map(t => ({ id: t.id, label: truckTitle(t), sub: truckSub(t) }))]
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {tabs.map(t => (
        <button key={t.id || 'all'} onClick={() => onChange(t.id)}
          className={`shrink-0 px-3 py-1.5 rounded-lg border text-left transition-colors ${value === t.id ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-700 text-gray-300 hover:bg-gray-800'}`}>
          <span className="block text-xs font-semibold leading-tight">{t.label}</span>
          {t.sub && <span className={`block text-[10px] leading-tight ${value === t.id ? 'text-blue-100' : 'text-gray-500'}`}>{t.sub}</span>}
        </button>
      ))}
    </div>
  )
}

function TruckNote({ truck }) {
  if (!truck) return null
  return (
    <p className="text-[11px] text-gray-500 bg-gray-800/40 rounded-lg px-3 py-2">
      Vista de <b className="text-gray-300">{truckFull(truck)}</b>: el impuesto se estima con el MPG de este camión. La declaración oficial es la <b className="text-gray-300">General</b> (MPG de toda la flota), por eso la suma de los camiones no da exactamente el total.
    </p>
  )
}

export default function Ifta() {
  const { activeCompany, loading } = useCompany()
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [detail, setDetail] = useState(null)
  // General (null) or one truck — applies to every quarter and the detail
  const [fleet, setFleet] = useState([])
  const [truckId, setTruckId] = useState(null)
  const [openOrder, setOpenOrder] = useState(null)
  const [orderVisible, setOrderVisible] = useState(false)
  const [openFuel, setOpenFuel] = useState(null)
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

  useEffect(() => {
    if (!activeCompany?.id) return
    loadIftaFleet(activeCompany.id).then(setFleet).catch(() => setFleet([]))
  }, [activeCompany?.id])

  function showOrder(id) {
    setOpenOrder(id)
    requestAnimationFrame(() => setOrderVisible(true))
  }
  function closeOrder() {
    setOrderVisible(false)
    setTimeout(() => setOpenOrder(null), 300)
  }
  function orderSaved() {
    // The detail shows a snapshot: close it and reload the quarter's numbers
    detail?.onChanged?.()
    setDetail(null)
    closeOrder()
    toast.success('Orden guardada. Los números del trimestre se actualizaron.')
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

  const started = quartersOf(year)

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

      {fleet.length > 1 && (
        <div className="mb-4 space-y-2">
          <TruckTabs fleet={fleet} value={truckId} onChange={setTruckId} />
          <TruckNote truck={fleet.find(t => t.id === truckId)} />
        </div>
      )}

      <div className="space-y-3">
        {[1, 2, 3, 4].map(q => started.includes(q)
          ? <QuarterCard key={`${activeCompany.id}-${year}-${q}-${version}`} company={activeCompany} year={year} quarter={q}
              truck={fleet.find(t => t.id === truckId) || null} onOpen={d => setDetail({ ...d, truckId })} />
          : <FutureQuarter key={q} year={year} quarter={q} />)}
      </div>

      {detail && (
        <QuarterDetail {...detail} fleet={fleet} hidden={!!openOrder} covered={!!openOrder || !!openFuel}
          onOpenOrder={showOrder} onOpenFuel={setOpenFuel} onClose={() => setDetail(null)} />
      )}
      {openFuel && <FuelPanel fuel={openFuel} truck={fleet.find(t => t.id === openFuel.truck_id)} onClose={() => setOpenFuel(null)} />}
      {openOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${orderVisible ? 'opacity-100' : 'opacity-0'}`} onClick={closeOrder} />
          <div className={`relative w-full max-w-4xl bg-gray-950 border-l border-gray-800 shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-out safe-top safe-bottom ${orderVisible ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-4 sm:p-6">
              <OrderDetail key={openOrder} orderId={openOrder} onClose={closeOrder} onSaved={orderSaved} />
            </div>
          </div>
        </div>
      )}
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
      setState({ loading: false, data, rates: ratesFor(year, quarter), filing })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }, [companyId, year, quarter])
  useEffect(() => { reload() }, [reload])
  return [state, reload]
}

function QuarterCard({ company, year, quarter, truck, onOpen }) {
  const toast = useToast()
  const [{ loading, error, data: fullData, rates, filing }, reload] = useQuarter(company.id, year, quarter)
  const data = useMemo(() => onlyTruck(fullData, truck?.id), [fullData, truck?.id])
  const calc = useMemo(() => data ? computeQuarter(data, rates) : null, [data, rates])
  const truckLabel = truck ? truckFull(truck) : null
  const [progress, setProgress] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const { from, to } = quarterRange(year, quarter)

  async function handleFill() {
    setProgress({ done: 0, total: fullData.orders.filter(o => o.needsMiles).length })
    try {
      // Always the whole fleet: miles depend on each truck's previous delivery only
      const { failed } = await fillStateMiles(fullData.orders, (done, total) => setProgress({ done, total }))
      if (failed.length) toast.warning(`No se pudo calcular la ruta de ${failed.length} orden(es): ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '...' : ''}`)
      else toast.success('Millas por estado calculadas')
    } finally {
      setProgress(null)
      reload()
    }
  }

  function handleExcel() {
    try {
      downloadIftaExcel({ company, year, quarter, data, calc, truckLabel })
    } catch (err) {
      toast.error('No se pudo generar el Excel: ' + err.message)
    }
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadIftaReport({ company, year, quarter, data, calc, filing: truck ? null : filing, truckLabel })
    } catch (err) {
      toast.error('No se pudo generar el reporte: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  const today = todayStr()
  const due = dueDate(year, quarter)
  const running = today <= to
  const status = filing ? 'filed' : !calc ? null : !data.trucks.length ? 'empty' : !data.orders.length && !data.diesel.length ? 'none' : running ? 'running' : calc.ready ? 'ready' : 'incomplete'
  const badge = {
    filed: { label: 'Declarado', cls: 'bg-blue-600/15 text-blue-400 border-blue-600/30' },
    running: { label: 'En curso', cls: 'bg-violet-600/15 text-violet-400 border-violet-600/30' },
    ready: { label: 'Listo', cls: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/30' },
    incomplete: { label: 'Incompleto', cls: 'bg-amber-600/15 text-amber-400 border-amber-600/30' },
    none: { label: 'Sin movimiento', cls: 'bg-gray-700/40 text-gray-400 border-gray-600/40' },
    empty: { label: 'Sin camiones', cls: 'bg-gray-700/40 text-gray-400 border-gray-600/40' },
  }[status]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
      <div className="lg:w-52 shrink-0">
        <div className="flex items-center justify-between lg:justify-start gap-2">
          <p className="text-lg font-bold text-white">Q{quarter} <span className="text-sm font-normal text-gray-500">{year}</span></p>
          {badge && <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border ${badge.cls}`}>{badge.label}</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5 capitalize">{QUARTER_MONTHS[quarter]}</p>
        <p className="text-[11px] text-gray-600">{shortDate(from)} - {shortDate(to)}</p>
        {!filing && (
          <p className={`text-[11px] mt-2 ${running ? 'text-gray-500' : today > due ? 'text-red-400 font-medium' : 'text-amber-400 font-medium'}`}>
            {running ? `Cierra el ${longDate(to)} · se declara hasta el ${longDate(due)}` : today > due ? `Venció el ${longDate(due)}` : `Declarar antes del ${longDate(due)}`}
          </p>
        )}
        {filing && <p className="text-[11px] text-blue-400/80 mt-2">Declarado el {new Date(filing.filed_at).toLocaleDateString('es-MX')}</p>}
      </div>

      <div className="flex-1 min-w-0 lg:min-h-[150px] flex flex-col justify-center">
        {loading ? (
          <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !data.trucks.length ? (
          <p className="text-sm text-gray-500 text-center">No hay camiones marcados como dry van (IFTA).<br /><span className="text-xs text-gray-600">Dashboard → editar camión → "Incluir en IFTA"</span></p>
        ) : calc.pendingOrders.length ? (
          <div className="text-center py-2">
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
        ) : !data.orders.length && !data.diesel.length ? (
          <p className="text-sm text-gray-500 text-center">Sin órdenes ni diesel{truck ? ' de este camión' : ''} en este trimestre.</p>
        ) : calc.mpg == null ? (
          <div className="text-center">
            <p className="text-sm text-amber-400">{data.orders.length} órdenes ({fmtNum(calc.totalMiles)} mi) pero ningún diesel con galones registrado{truck ? ' para este camión' : ''}.</p>
            <p className="text-xs text-gray-500 mt-1">Sin diesel no se puede calcular el MPG ni el impuesto. Registra sus cargas en Gastos del camión.</p>
          </div>
        ) : !rates ? (
          <div className="text-center">
            <p className="text-sm text-gray-300">{fmtNum(calc.totalMiles)} mi · {fmtNum(calc.totalGallons, 1)} gal · {calc.mpg.toFixed(2)} MPG</p>
            <p className="text-xs text-amber-400 mt-1">Faltan las tasas oficiales de Q{quarter} {year} para calcular el impuesto.</p>
          </div>
        ) : (
          <QuarterSummary calc={calc} data={data} />
        )}
      </div>

      {!loading && !error && data?.trucks.length > 0 && (
        <div className="pt-4 border-t border-gray-800 lg:pt-0 lg:border-t-0 lg:pl-6 lg:border-l flex lg:flex-col gap-2 lg:w-36 shrink-0">
          <button
            onClick={handleDownload}
            disabled={downloading || !calc?.mpg || !!calc?.pendingOrders.length || !rates}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            {downloading ? 'Generando...' : 'PDF'}
          </button>
          <button
            onClick={handleExcel}
            disabled={!calc?.mpg || !!calc?.pendingOrders.length || !rates}
            title="Excel con las fórmulas, cada orden y cada carga de diesel, para verificar el cálculo"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-700/50 text-sm text-emerald-300 hover:bg-emerald-600/10 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" /></svg>
            Excel
          </button>
          <button
            onClick={() => onOpen({ company, year, quarter, data: fullData, filing, rates, onChanged: reload })}
            disabled={!calc}
            title="Ver detalle y recorrido"
            className="px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 inline-flex items-center justify-center gap-1.5 text-sm"
          >
            <span className="hidden lg:inline">Detalle</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

const QUARTER_MONTHS = { 1: 'enero · febrero · marzo', 2: 'abril · mayo · junio', 3: 'julio · agosto · septiembre', 4: 'octubre · noviembre · diciembre' }

function FutureQuarter({ year, quarter }) {
  const { from, to } = quarterRange(year, quarter)
  return (
    <div className="border border-dashed border-gray-800 rounded-xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 opacity-70">
      <div className="lg:w-52 shrink-0 flex items-baseline gap-2">
        <p className="text-lg font-bold text-gray-500">Q{quarter} <span className="text-sm font-normal">{year}</span></p>
        <p className="text-[11px] text-gray-600">{shortDate(from)} - {shortDate(to)}</p>
      </div>
      <p className="text-xs text-gray-500"><span className="capitalize">{QUARTER_MONTHS[quarter]}</span> · empieza el {longDate(from)}</p>
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

function QuarterSummary({ calc, data }) {
  const items = topStates(calc)
  const alerts = calc.warnings.length + calc.fuelIssues.length
  const stats = [
    ['Millas', fmtNum(calc.totalMiles)],
    ['Galones', fmtNum(calc.totalGallons, 1)],
    ['MPG', calc.mpg.toFixed(2), calc.mpg < 4 || calc.mpg > 9],
    ['Órdenes', fmtNum(data.orders.length)],
    ['Cargas de diesel', fmtNum(data.diesel.length)],
    ['Alertas', alerts ? `⚠ ${alerts}` : '0', alerts > 0],
  ]
  return (
    // Stats sit beside the chart when there's room, below it otherwise
    <div className="flex flex-wrap items-center gap-4 xl:gap-8">
      <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-4">
      <Donut items={items} total={calc.totalDue} />
      <div className="w-full sm:w-64 shrink-0 space-y-1.5">
        {items.map((it, i) => (
          <div key={it.state} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
            <span className="w-14 text-gray-300">{it.state}</span>
            <span className={`flex-1 text-right font-medium tabular-nums ${it.due < 0 ? 'text-emerald-400' : 'text-gray-100'}`}>{fmtMoney(it.due)}</span>
            <span className="w-10 text-right text-xs text-gray-500 tabular-nums">{it.pct}%</span>
          </div>
        ))}
      </div>
      </div>
      <div className="grow basis-[300px] grid grid-cols-3 gap-2">
        {stats.map(([label, value, warn]) => (
          <div key={label} className="rounded-lg bg-gray-800/40 px-3 py-2 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 truncate">{label}</p>
            <p className={`text-sm font-semibold tabular-nums ${warn ? 'text-amber-400' : 'text-gray-100'}`}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuarterDetail({ company, year, quarter, data: fullData, rates, filing, fleet, truckId: initialTruck, hidden, covered, onOpenOrder, onOpenFuel, onChanged, onClose }) {
  const toast = useToast()
  const { session } = useAuth()
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('summary')
  const [truckId, setTruckId] = useState(initialTruck || null)
  const data = useMemo(() => onlyTruck(fullData, truckId), [fullData, truckId])
  const calc = useMemo(() => computeQuarter(data, rates), [data, rates])
  // Filing is always for the whole fleet
  const fleetCalc = useMemo(() => computeQuarter(fullData, rates), [fullData, rates])
  const truck = fleet.find(t => t.id === truckId) || null
  const truckName = id => truckFull(fleet.find(t => t.id === id) || data.trucks.find(t => t.id === id))

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !covered) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, covered])

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
          totals: { totalDue: fleetCalc.totalDue, totalMiles: fleetCalc.totalMiles, totalGallons: fleetCalc.totalGallons, mpg: fleetCalc.mpg, rows: fleetCalc.rows },
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

  const filedDiffers = filing?.totals && Math.abs((filing.totals.totalDue || 0) - fleetCalc.totalDue) > 0.01
  const alertCount = calc.warnings.length + calc.fuelIssues.length

  return createPortal(
    <div className={`fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-3 sm:p-6 ${hidden ? 'hidden' : ''}`} onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-800">
          <div>
            <p className="text-sm font-semibold text-white">IFTA Q{quarter} {year}{truck && <span className="text-blue-400"> · {truckTitle(truck)}</span>}</p>
            <p className="text-xs text-gray-500">{fmtNum(calc.totalMiles)} mi · {fmtNum(calc.totalGallons, 1)} gal · {calc.mpg ? `${calc.mpg.toFixed(2)} MPG` : 'sin MPG'} · Total {fmtMoney(calc.totalDue)}</p>
          </div>
          <div className="flex items-center gap-2">
            {!truck && <button onClick={toggleFiled} disabled={saving || !fleetCalc.mpg} className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${filing ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
              {filing ? 'Quitar "declarado"' : 'Marcar como declarado'}
            </button>}
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {fleet.length > 1 && <div className="px-5 pt-3"><TruckTabs fleet={fleet} value={truckId} onChange={setTruckId} /></div>}
        <div className="flex gap-1 px-5 pt-3 border-b border-gray-800">
          {[['summary', 'Resumen'], ['trip', 'Recorrido'], ['alerts', `Alertas${alertCount ? ` (${alertCount})` : ''}`]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 -mb-px text-xs font-medium border-b-2 transition-colors ${tab === key ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto overscroll-none p-5 space-y-6">
          {tab === 'trip' ? <TripLog data={data} truckName={truckName} onOpenOrder={onOpenOrder} onOpenFuel={onOpenFuel} />
          : tab === 'alerts' ? <AlertList calc={calc} truckName={truckName} onOpenOrder={onOpenOrder} onOpenFuel={onOpenFuel} />
          : <>
          <TruckNote truck={truck} />
          {filing && !truck && (
            <p className={`text-xs rounded-lg px-3 py-2 ${filedDiffers ? 'bg-amber-900/30 text-amber-300' : 'bg-blue-900/20 text-blue-300'}`}>
              Declarado el {new Date(filing.filed_at).toLocaleDateString('es-MX')}{filing.filed_by ? ` por ${filing.filed_by}` : ''} con un total de {fmtMoney(filing.totals?.totalDue)}.
              {filedDiffers && ` Los datos cambiaron después de declararlo: hoy da ${fmtMoney(fleetCalc.totalDue)}.`}
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
                      <td className="py-1.5 text-gray-200">{truckName(t.id)}</td>
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

          {alertCount > 0 && (
            <button onClick={() => setTab('alerts')} className="w-full text-left text-xs rounded-lg px-3 py-2 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15">
              ⚠ {alertCount} alerta(s) para revisar — toca para verlas
            </button>
          )}
          </>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Recorrido: the truck's quarter step by step ──
// Every order split into its two legs (empty from the previous delivery, then
// loaded) and every diesel purchase, in date order, with running totals —
// the raw data behind the per-state numbers, to check it by hand.

const sumMiles = obj => Object.values(obj || {}).reduce((s, v) => s + v, 0)
const fmtStates = obj => Object.entries(obj || {}).filter(([, mi]) => mi >= 0.5)
  .sort((a, b) => b[1] - a[1]).map(([st, mi]) => `${st} ${fmtNum(mi)}`).join(' · ')

function buildTrip(data) {
  const events = []
  for (const o of data.orders) {
    // Same miles computeQuarter counts: state_miles when present (even stale)
    const calc = !!o.state_miles
    events.push({ kind: 'order', date: o.pu_date, sort: `${o.pu_date}|0|${o.do_date || ''}`, order: o, places: loadedPlaces(o, o.stops),
      empty: calc ? sumMiles(o.state_miles.empty) : Number(o.dead_miles) || 0,
      loaded: calc ? sumMiles(o.state_miles.loaded) : Number(o.miles) || 0,
      calc, stale: o.needsMiles })
  }
  for (const f of data.diesel) {
    events.push({ kind: 'fuel', date: f.date, sort: `${f.date}|1`, fuel: f, gallons: Number(f.gallons) || 0, state: stateOfCity(f.city) })
  }
  events.sort((a, b) => a.sort.localeCompare(b.sort))

  let miles = 0, gallons = 0
  const lastDo = {}
  for (const e of events) {
    if (e.kind === 'order') {
      const t = e.order.truck_id
      miles += e.empty + e.loaded
      // A pickup before the same truck's previous delivery means overlapping dates
      e.overlap = lastDo[t] && e.order.pu_date < lastDo[t]
      if (e.order.do_date) lastDo[t] = e.order.do_date
    } else gallons += e.gallons
    e.totalMiles = miles
    e.totalGallons = gallons
  }
  return { events, miles, gallons }
}

function TripLog({ data, truckName, onOpenOrder, onOpenFuel }) {
  if (!data.orders.length && !data.diesel.length) return <p className="text-sm text-gray-500 text-center py-10">No hay órdenes ni diesel en este trimestre.</p>
  const { events, miles, gallons } = buildTrip(data)
  const orders = events.filter(e => e.kind === 'order').length
  // General with several trucks: say whose each row is
  const many = new Set([...data.orders.map(o => o.truck_id), ...data.diesel.map(f => f.truck_id)]).size > 1
  const who = id => many ? <span className="block text-[10px] text-gray-500 mt-0.5">{truckName(id)}</span> : null

  return (
    <section className="space-y-3">
      <p className="text-xs text-gray-500">
        {orders} órdenes · {events.length - orders} cargas de diesel · {fmtNum(miles)} mi · {fmtNum(gallons, 1)} gal{gallons ? ` · ${(miles / gallons).toFixed(2)} MPG` : ''}
        <span className="text-gray-600"> · toca una fila para ver la orden o la factura</span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-[11px] uppercase text-gray-500 border-b border-gray-800">
            <th className="text-left py-2 pr-3">Fecha</th><th className="text-left pr-3">Movimiento</th><th className="text-left pr-3">De → a</th>
            <th className="text-left pr-3">Estados</th><th className="text-right pr-3">Millas</th><th className="text-right pr-3">Galones</th><th className="text-right">Acumulado</th>
          </tr></thead>
          <tbody>
            {events.map(e => e.kind === 'order' ? (
              <OrderLegs key={e.order.id} e={e} who={who} onOpen={() => onOpenOrder(e.order.id)} />
            ) : (
              <tr key={e.fuel.id} onClick={() => onOpenFuel(e.fuel)} className="border-b border-gray-800/60 bg-orange-500/5 cursor-pointer hover:bg-orange-500/10">
                <td className="py-1.5 pr-3 text-gray-300 tabular-nums whitespace-nowrap">{shortDate(e.date)}</td>
                <td className="pr-3"><span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">Diesel</span>{e.fuel.invoice_number && <span className="block text-[11px] text-gray-600">Fact. {e.fuel.invoice_number}</span>}{who(e.fuel.truck_id)}</td>
                <td className="pr-3 text-gray-300">{e.fuel.city || <span className="text-amber-400">sin ciudad</span>}</td>
                <td className="pr-3 text-gray-400">{e.state || <span className="text-amber-400">sin estado</span>}</td>
                <td className="pr-3" />
                <td className="pr-3 text-right tabular-nums text-orange-300">{e.gallons ? fmtNum(e.gallons, 2) : <span className="text-amber-400">—</span>}<span className="block text-[11px] text-gray-600">{fmtMoney(e.fuel.value)}</span></td>
                <td className="text-right tabular-nums text-[11px] text-gray-500 whitespace-nowrap">{fmtNum(e.totalGallons, 1)} gal</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-600">Ordenado por fecha de pickup; el diesel se intercala por su fecha. Las millas son las que entran al IFTA (ruta por estado ajustada a las millas de la orden).</p>
    </section>
  )
}

function OrderLegs({ e, who, onOpen }) {
  const o = e.order
  const sm = e.calc ? o.state_miles : null
  const pending = e.stale && <span className="block text-[11px] text-amber-400">{e.calc ? 'desactualizado: usa "Calcular millas"' : 'millas por estado sin calcular'}</span>
  return (
    <>
      <tr onClick={onOpen} className="border-t border-gray-800 cursor-pointer hover:bg-gray-800/40">
        <td rowSpan={o.prevDoCity ? 2 : 1} className="py-1.5 pr-3 align-top text-gray-300 tabular-nums whitespace-nowrap">
          {shortDate(o.pu_date)}{o.do_date && o.do_date !== o.pu_date && <span className="block text-[11px] text-gray-500">→ {shortDate(o.do_date)}</span>}
          {e.overlap && <span className="block text-[11px] text-amber-400">se cruza con la anterior</span>}
          {who(o.truck_id)}
        </td>
        {o.prevDoCity ? (
          <>
            <td className="pr-3"><span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">Vacío (DH)</span><span className="block text-[11px] text-gray-600">hacia #{o.order_number}</span></td>
            <td className="pr-3 text-gray-400">{o.prevDoCity} → {e.places[0] || o.pu_city}</td>
            <td className="pr-3 text-[12px] text-gray-500">{sm ? fmtStates(sm.empty) : ''}{pending}</td>
            <td className="pr-3 text-right tabular-nums text-gray-400">{fmtNum(e.empty)}</td>
            <td className="pr-3" /><td />
          </>
        ) : <LoadedCells e={e} pending={pending} />}
      </tr>
      {o.prevDoCity && <tr onClick={onOpen} className="border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/40"><LoadedCells e={e} pending={pending} /></tr>}
    </>
  )
}

function LoadedCells({ e, pending }) {
  const o = e.order
  const sm = e.calc ? o.state_miles : null
  return (
    <>
      <td className="py-1.5 pr-3"><span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">Orden #{o.order_number}</span>{!o.prevDoCity && <span className="block text-[11px] text-gray-600">sin entrega anterior</span>}</td>
      <td className="pr-3 text-gray-200">{e.places.join(' → ')}</td>
      <td className="pr-3 text-[12px] text-gray-400">{sm ? fmtStates(sm.loaded) : ''}{pending}</td>
      <td className="pr-3 text-right tabular-nums text-gray-200">{fmtNum(e.loaded)}</td>
      <td className="pr-3" />
      <td className="text-right tabular-nums text-[11px] text-gray-500 whitespace-nowrap">{fmtNum(e.totalMiles)} mi</td>
    </>
  )
}

// ── Alertas: each one with its data, tap to open the order or the receipt ──

function fuelImpact(f) {
  if (!Number(f.gallons)) return 'No cuenta para nada en el IFTA (ni MPG ni compras). Si hubo galones, agrégalos.'
  return 'Cuenta para el MPG, pero no como compra en ningún estado: pierdes el crédito de ese diesel y el impuesto sale más alto. Agrega la ciudad con su estado ("CIUDAD, ST").'
}

function AlertList({ calc, truckName, onOpenOrder, onOpenFuel }) {
  if (!calc.warnings.length && !calc.fuelIssues.length) return <p className="text-sm text-emerald-400 text-center py-10">No hay alertas en este trimestre.</p>
  return (
    <section className="space-y-4">
      {calc.warnings.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Órdenes con millas que no cuadran ({calc.warnings.length})</h3>
          <p className="text-[11px] text-gray-600 mb-2">Las millas registradas en la orden están muy lejos de la ruta real (menos de la mitad o más de 1.6 veces). Para el IFTA se usaron las de la ruta.</p>
          <div className="space-y-2">
            {calc.warnings.map(o => (
              <button key={o.id} onClick={() => onOpenOrder(o.id)} className="w-full text-left rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium text-amber-300">Orden #{o.order_number} <span className="text-[11px] text-gray-500 font-normal">— abrir orden ›</span></span>
                  <span className="text-[11px] text-gray-500">{truckName(o.truck_id)} · {shortDate(o.pu_date)}{o.do_date ? ` → ${shortDate(o.do_date)}` : ''}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{loadedPlaces(o, o.stops).join(' → ')}</p>
                <ul className="mt-1 text-xs text-gray-300 list-disc pl-4 space-y-0.5">
                  {o.state_miles.warnings.map(w => <li key={w}>{w}</li>)}
                </ul>
              </button>
            ))}
          </div>
        </div>
      )}
      {calc.fuelIssues.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Diesel incompleto ({calc.fuelIssues.length})</h3>
          <p className="text-[11px] text-gray-600 mb-2">Cargas sin galones o sin ciudad/estado. Toca para ver la factura.</p>
          <div className="space-y-2">
            {calc.fuelIssues.map(f => (
              <button key={f.id} onClick={() => onOpenFuel(f)} className="w-full text-left rounded-lg border border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium text-orange-300">Diesel {shortDate(f.date)}{f.invoice_number ? ` · Factura ${f.invoice_number}` : ''} <span className="text-[11px] text-gray-500 font-normal">— ver factura ›</span></span>
                  <span className="text-[11px] text-gray-500">{truckName(f.truck_id)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{f.city || 'Sin ciudad'} · {Number(f.gallons) ? `${fmtNum(f.gallons, 2)} gal` : 'sin galones'} · {fmtMoney(f.value)}</p>
                <p className="text-xs text-gray-300 mt-1"><b className="text-amber-400">{f.problem}.</b> {fuelImpact(f)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// A diesel purchase with its stored receipt, over the detail
function FuelPanel({ fuel, truck, onClose }) {
  const navigate = useNavigate()
  const state = stateOfCity(fuel.city)
  const issue = !Number(fuel.gallons) || !state
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const url = fuel.receipt_path ? receiptUrl(fuel.receipt_path) : null
  const field = (label, value, bad) => (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-sm truncate ${bad ? 'text-amber-400' : 'text-gray-100'}`}>{value}</p>
    </div>
  )
  return createPortal(
    <div className="fixed inset-0 z-[9995] bg-black/60 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-800">
          <div>
            <p className="text-sm font-semibold text-white">Diesel {shortDate(fuel.date)}{fuel.invoice_number ? ` · Factura ${fuel.invoice_number}` : ''}</p>
            <p className="text-xs text-gray-500">{truckFull(truck)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto overscroll-none p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {field('Fecha', shortDate(fuel.date))}
            {field('Ciudad', fuel.city || 'Sin ciudad', !fuel.city)}
            {field('Estado', state || 'Sin estado', !state)}
            {field('Galones', Number(fuel.gallons) ? fmtNum(fuel.gallons, 2) : 'Sin galones', !Number(fuel.gallons))}
            {field('Monto', fmtMoney(fuel.value))}
            {field('Factura', fuel.invoice_number || '—')}
          </div>
          {issue && <p className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2">{fuelImpact(fuel)}</p>}
          {url ? (
            isPdfReceipt(fuel.receipt_path)
              ? <div className="rounded-lg overflow-hidden border border-gray-800"><PdfViewer url={url} /></div>
              : <img src={url} alt="Factura" className="w-full rounded-lg border border-gray-800" />
          ) : (
            <p className="text-xs text-gray-500 text-center py-6 border border-dashed border-gray-800 rounded-lg">Esta carga no tiene la foto de la factura guardada (se registró sin escanear o antes de que se guardaran las fotos).</p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-800 flex justify-end">
          <button onClick={() => navigate(`/truck/${fuel.truck_id}`, { state: { tab: 'expenses', cycleId: fuel.cycle_id } })}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500">
            Ir a Gastos del camión para corregirlo
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
