import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/orders'
import { useToast } from './Toast'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const PAY_MODES = [
  { key: 'flat_rate',   label: 'Flat Rate',   desc: 'Salario fijo',      color: 'blue' },
  { key: 'percentage',  label: 'Porcentaje',  desc: '% del gross',       color: 'orange' },
  { key: 'per_mile',    label: 'Por Milla',   desc: '¢ por milla',       color: 'green' },
]

const MODE_COLORS = {
  flat_rate:  { badge: 'bg-blue-900/30 text-blue-400 border-blue-800/40',   btn: 'bg-blue-600 text-white hover:bg-blue-500',   ring: 'border-blue-500' },
  percentage: { badge: 'bg-orange-900/30 text-orange-400 border-orange-800/40', btn: 'bg-orange-600 text-white hover:bg-orange-500', ring: 'border-orange-500' },
  per_mile:   { badge: 'bg-green-900/30 text-green-400 border-green-800/40',  btn: 'bg-green-700 text-white hover:bg-green-600',   ring: 'border-green-500' },
}

function calcPayout(mode, rate, orders) {
  const gross = orders.reduce((s, o) => s + (Number(o.rate) || 0), 0)
  const totalMiles = orders.reduce((s, o) => s + (Number(o.miles) || 0) + (Number(o.dead_miles) || 0), 0)
  const r = Number(rate) || 0
  if (mode === 'flat_rate')  return r
  if (mode === 'percentage') return gross * r / 100
  if (mode === 'per_mile')   return totalMiles * r / 100
  return 0
}

function totalMilesOf(orders) {
  return orders.reduce((s, o) => s + (Number(o.miles) || 0) + (Number(o.dead_miles) || 0), 0)
}
function grossOf(orders) {
  return orders.reduce((s, o) => s + (Number(o.rate) || 0), 0)
}

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}
function fmtShort(d) {
  if (!d) return '—'
  const [, m, day] = d.split('-')
  return `${m}/${day}`
}

function useCountUp(target, duration = 500) {
  const [value, setValue] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef(null)
  useEffect(() => {
    const from = prevRef.current
    if (from === target) return
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else { prevRef.current = target; setValue(target) }
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}
function AnimatedMoney({ value }) {
  const v = useCountUp(Number(value) || 0)
  return <>{fmt(v)}</>
}

export default function DriverPaymentModal({ driver, truck, onClose }) {
  const [payments, setPayments] = useState([])
  const [orders, setOrders] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [payMode, setPayMode] = useState('percentage')
  const [payRate, setPayRate] = useState('0')
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(null)
  const htmlCache = useRef({})
  const toast = useToast()

  const driverName = driver.name || ''
  const driverEmail = driver.email || ''
  const truckName = truck ? `${truck.name} #${truck.number}` : ''

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [paymentsRes, ordersRes] = await Promise.all([
      supabase.from('driver_payments')
        .select('*')
        .eq('driver_id', driver.id)
        .order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('id, order_number, pu_city, do_city, pu_date, do_date, rate, miles, dead_miles, status')
        .eq('driver_name', driverName)
        .in('status', ['paid', 'invoiced'])
        .order('pu_date', { ascending: false }),
    ])

    const existingPayments = paymentsRes.data || []
    const usedIds = new Set(existingPayments.flatMap(p => p.order_ids || []))
    const unpaid = (ordersRes.data || []).filter(o => !usedIds.has(o.id))

    setPayments(existingPayments)
    setOrders(unpaid)
    setLoading(false)
  }

  const selectedOrders = orders.filter(o => selectedIds.has(o.id))
  const gross = grossOf(selectedOrders)
  const totalMiles = totalMilesOf(selectedOrders)
  const payout = calcPayout(payMode, payRate, selectedOrders)

  function toggleOrder(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleAll() {
    if (selectedIds.size === orders.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(orders.map(o => o.id)))
  }

  async function savePayment() {
    if (payMode !== 'flat_rate' && !selectedIds.size)
      return toast.warning('Selecciona al menos una orden')
    if (!Number(payRate)) return toast.warning('Ingresa el monto / tasa de pago')
    setSaving(true)

    const today = new Date().toISOString().split('T')[0]
    let periodStart = today
    let periodEnd = today
    if (selectedOrders.length) {
      const sorted = [...selectedOrders].sort((a, b) => (a.pu_date || '') < (b.pu_date || '') ? -1 : 1)
      periodStart = sorted[0]?.pu_date || today
      periodEnd = sorted[sorted.length - 1]?.do_date || sorted[sorted.length - 1]?.pu_date || today
    }

    const { error } = await supabase.from('driver_payments').insert({
      driver_id: driver.id,
      driver_name: driverName,
      driver_email: driverEmail || null,
      truck_id: driver.truck_id || null,
      pay_mode: payMode,
      pay_rate: Number(payRate),
      gross_revenue: gross,
      total_miles: totalMiles,
      payout,
      pay_date: today,
      period_start: periodStart,
      period_end: periodEnd,
      order_ids: [...selectedIds],
      payment_number: payments.length + 1,
    })

    if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
    toast.success('Pago registrado')
    setShowNew(false)
    setSelectedIds(new Set())
    await fetchData()
    setSaving(false)
  }

  async function fetchPreview(payment, force = false) {
    if (!force && htmlCache.current[payment.id]) {
      setPreviewHtml(htmlCache.current[payment.id])
      return
    }
    setPreviewLoading(payment.id)
    try {
      const { data: pOrders } = await supabase.from('orders')
        .select('id, order_number, pu_city, do_city, pu_date, do_date, rate, miles, dead_miles')
        .in('id', payment.order_ids || [])

      const res = await fetch('/api/send-driver-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          paymentNumber: payment.payment_number,
          driverName, driverEmail, truckName,
          payMode: payment.pay_mode,
          payRate: payment.pay_rate,
          gross: payment.gross_revenue,
          totalMiles: payment.total_miles,
          payout: payment.payout,
          payDate: payment.pay_date,
          periodStart: payment.period_start,
          periodEnd: payment.period_end,
          orders: pOrders || [],
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.html) throw new Error(data.error || 'Error')
      htmlCache.current[payment.id] = data.html
      setPreviewHtml(data.html)
    } catch (e) {
      toast.error('Error al generar preview: ' + e.message)
    }
    setPreviewLoading(null)
  }

  function regenerate(payment) {
    delete htmlCache.current[payment.id]
    fetchPreview(payment, true)
  }

  async function generatePDF(html) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;background:#f3f4f6;padding:24px;box-sizing:border-box;'
    container.innerHTML = doc.body.innerHTML
    document.body.appendChild(container)
    const imgs = container.querySelectorAll('img')
    await Promise.all(Array.from(imgs).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r })))
    const mainDiv = container.firstElementChild || container
    const pdf = new jsPDF('p', 'mm', 'letter')
    const pageW = 215.9, pageH = 279.4, margin = 10
    const canvas = await html2canvas(mainDiv, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const imgW = pageW - margin * 2
    const imgH = (canvas.height * imgW) / canvas.width
    const pixPerMM = canvas.height / imgH
    const maxH = pageH - margin * 2
    if (imgH <= maxH) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, imgH)
    } else {
      let yMM = 0
      while (yMM < imgH) {
        if (yMM > 0) pdf.addPage()
        const sliceH = Math.min(maxH, imgH - yMM)
        const sy = Math.round(yMM * pixPerMM), sh = Math.round(sliceH * pixPerMM)
        const pc = document.createElement('canvas')
        pc.width = canvas.width; pc.height = sh
        pc.getContext('2d').drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
        pdf.addImage(pc.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, sliceH)
        yMM += maxH
      }
    }
    document.body.removeChild(container)
    return pdf.output('datauristring').split(',')[1]
  }

  async function sendSettlement(payment) {
    if (!driverEmail) return toast.warning('Este conductor no tiene email registrado')
    setSendingId(payment.id)
    try {
      const { data: pOrders } = await supabase.from('orders')
        .select('id, order_number, pu_city, do_city, pu_date, do_date, rate, miles, dead_miles')
        .in('id', payment.order_ids || [])

      let html = htmlCache.current[payment.id]
      if (!html) {
        const r = await fetch('/api/send-driver-settlement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'preview',
            paymentNumber: payment.payment_number,
            driverName, driverEmail, truckName,
            payMode: payment.pay_mode,
            payRate: payment.pay_rate,
            gross: payment.gross_revenue,
            totalMiles: payment.total_miles,
            payout: payment.payout,
            payDate: payment.pay_date,
            periodStart: payment.period_start,
            periodEnd: payment.period_end,
            orders: pOrders || [],
          }),
        })
        const d = await r.json()
        if (!r.ok || !d.html) throw new Error(d.error || 'Error generando documento')
        html = d.html
        htmlCache.current[payment.id] = html
      }

      toast.info('Generando PDF...')
      const pdfBase64 = await generatePDF(html)

      toast.info('Enviando a ' + driverEmail + '...')
      const res = await fetch('/api/send-driver-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentNumber: payment.payment_number,
          driverName, driverEmail, truckName,
          payMode: payment.pay_mode,
          payRate: payment.pay_rate,
          gross: payment.gross_revenue,
          totalMiles: payment.total_miles,
          payout: payment.payout,
          payDate: payment.pay_date,
          periodStart: payment.period_start,
          periodEnd: payment.period_end,
          orders: pOrders || [],
          pdfBase64,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')

      await supabase.from('driver_payments').update({ email_sent_at: new Date().toISOString() }).eq('id', payment.id)
      toast.success('Settlement enviado a ' + driverEmail)
      await fetchData()
    } catch (e) {
      toast.error('Error al enviar: ' + e.message)
    }
    setSendingId(null)
  }

  const modeInfo = PAY_MODES.find(m => m.key === payMode)
  const modeColor = MODE_COLORS[payMode]

  return (
    <>
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-cyan-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {driverName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{driverName}</h2>
              <p className="text-xs text-gray-500">
                {driverEmail || 'Sin email'}{truckName ? ` · ${truckName}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowNew(v => !v); setSelectedIds(new Set()) }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold transition-colors ${showNew ? 'bg-gray-700 text-gray-300' : 'bg-cyan-600 text-white hover:bg-cyan-500'}`}
              title="Nuevo pago"
            >{showNew ? '×' : '+'}</button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* Left: History */}
          <div className={`flex flex-col overflow-hidden ${showNew ? 'flex-1 border-r border-gray-800' : 'flex-1'}`}>
            <div className="px-5 py-3 border-b border-gray-800 shrink-0 flex items-center justify-between">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Historial de Pagos</p>
              <span className="text-[10px] text-gray-600">{payments.length} registro{payments.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-14 h-14 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
                    <svg className="w-7 h-7 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Sin pagos registrados</p>
                  <p className="text-gray-600 text-xs mt-1">Presiona <span className="text-cyan-400 font-bold">+</span> para registrar el primer pago</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payments.map(p => {
                    const mc = MODE_COLORS[p.pay_mode] || MODE_COLORS.percentage
                    const modeLabel = PAY_MODES.find(m => m.key === p.pay_mode)?.label || p.pay_mode
                    let rateLabel = ''
                    if (p.pay_mode === 'flat_rate') rateLabel = fmt(p.pay_rate)
                    else if (p.pay_mode === 'percentage') rateLabel = `${p.pay_rate}%`
                    else if (p.pay_mode === 'per_mile') rateLabel = `${p.pay_rate}¢/mi`
                    return (
                      <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-cyan-600/15 border border-cyan-600/25 flex items-center justify-center shrink-0">
                            <span className="text-cyan-400 text-[11px] font-bold">#{p.payment_number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-base font-bold text-green-400">{fmt(p.payout)}</p>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${mc.badge}`}>{modeLabel} · {rateLabel}</span>
                              {p.email_sent_at && (
                                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800/40 font-semibold">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                                  Enviado {fmtDate(p.email_sent_at.split('T')[0])}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {p.total_miles > 0 && <><span className="text-gray-300">{Number(p.total_miles).toLocaleString()} mi</span><span className="mx-1.5 text-gray-700">·</span></>}
                              Gross: <span className="text-gray-300">{fmt(p.gross_revenue)}</span>
                              <span className="mx-1.5 text-gray-700">·</span>
                              {(p.order_ids || []).length} carga{(p.order_ids || []).length !== 1 ? 's' : ''}
                            </p>
                            {(p.period_start || p.period_end) && (
                              <p className="text-[10px] text-gray-600 mt-1">{fmtDate(p.period_start)} — {fmtDate(p.period_end)}</p>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 shrink-0">{fmtDate(p.pay_date)}</p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-800">
                          <button onClick={() => fetchPreview(p)} disabled={previewLoading === p.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
                            {previewLoading === p.id
                              ? <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
                              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>}
                            Previsualizar
                          </button>
                          <button onClick={() => regenerate(p)} disabled={previewLoading === p.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                            Regenerar
                          </button>
                          <button onClick={() => sendSettlement(p)} disabled={sendingId === p.id || !driverEmail}
                            title={!driverEmail ? 'Sin email registrado' : ''}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50">
                            {sendingId === p.id
                              ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>}
                            Enviar
                          </button>
                          <div className="flex-1" />
                          <button
                            onClick={async () => {
                              const ok = await toast.confirm('¿Eliminar este pago?')
                              if (!ok) return
                              await supabase.from('driver_payments').delete().eq('id', p.id)
                              delete htmlCache.current[p.id]
                              await fetchData()
                            }}
                            className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-600/10 rounded-lg transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: New payment */}
          {showNew && (
            <div className="w-[400px] shrink-0 flex flex-col overflow-hidden bg-gray-900/30">

              {/* Pay mode selector */}
              <div className="px-5 pt-4 pb-3 border-b border-gray-800 shrink-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-3">Nuevo Pago</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {PAY_MODES.map(m => {
                    const mc = MODE_COLORS[m.key]
                    const active = payMode === m.key
                    return (
                      <button
                        key={m.key}
                        onClick={() => { setPayMode(m.key); setPayRate('0') }}
                        className={`px-2 py-2.5 rounded-xl border text-center transition-all ${active ? `${mc.badge} ${mc.ring} border` : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'}`}
                      >
                        <p className="text-xs font-bold leading-tight">{m.label}</p>
                        <p className="text-[9px] mt-0.5 opacity-70">{m.desc}</p>
                      </button>
                    )
                  })}
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {payMode === 'flat_rate' && (
                    <>
                      <div className="col-span-2 bg-gray-800/70 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Monto Fijo</p>
                        <div className="flex items-center justify-center gap-0.5">
                          <span className="text-sm font-bold text-blue-400">$</span>
                          <input type="number" min="0" step="0.01" value={payRate} onChange={e => setPayRate(e.target.value)}
                            className="w-20 bg-transparent text-sm font-bold text-blue-400 text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                      </div>
                      <div className="bg-blue-600/15 border border-blue-600/30 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-blue-400 uppercase tracking-wide mb-1">Pago</p>
                        <p className="text-sm font-bold text-blue-400"><AnimatedMoney value={payout} /></p>
                      </div>
                    </>
                  )}
                  {payMode === 'percentage' && (
                    <>
                      <div className="bg-gray-800/70 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Gross</p>
                        <p className="text-sm font-bold text-white"><AnimatedMoney value={gross} /></p>
                      </div>
                      <div className="bg-gray-800/70 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">%</p>
                        <div className="flex items-center justify-center gap-0.5">
                          <input type="number" min="0" max="100" step="0.5" value={payRate} onChange={e => setPayRate(e.target.value)}
                            className="w-10 bg-transparent text-sm font-bold text-orange-400 text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <span className="text-sm font-bold text-orange-400">%</span>
                        </div>
                      </div>
                      <div className="bg-orange-600/15 border border-orange-600/30 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-orange-400 uppercase tracking-wide mb-1">Pago</p>
                        <p className="text-sm font-bold text-orange-400"><AnimatedMoney value={payout} /></p>
                      </div>
                    </>
                  )}
                  {payMode === 'per_mile' && (
                    <>
                      <div className="bg-gray-800/70 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Millas</p>
                        <p className="text-sm font-bold text-white">{totalMiles.toLocaleString()}</p>
                      </div>
                      <div className="bg-gray-800/70 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">¢/Milla</p>
                        <div className="flex items-center justify-center gap-0.5">
                          <input type="number" min="0" step="0.5" value={payRate} onChange={e => setPayRate(e.target.value)}
                            className="w-10 bg-transparent text-sm font-bold text-green-400 text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <span className="text-sm font-bold text-green-400">¢</span>
                        </div>
                      </div>
                      <div className="bg-green-700/15 border border-green-700/30 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-green-400 uppercase tracking-wide mb-1">Pago</p>
                        <p className="text-sm font-bold text-green-400"><AnimatedMoney value={payout} /></p>
                      </div>
                    </>
                  )}
                </div>

                {orders.length > 0 && payMode !== 'flat_rate' && (
                  <button onClick={toggleAll} className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors text-left">
                    {selectedIds.size === orders.length ? 'Deseleccionar todas' : `Seleccionar todas (${orders.length})`}
                    <span className="float-right text-cyan-400">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</span>
                  </button>
                )}
                {payMode === 'flat_rate' && orders.length > 0 && (
                  <button onClick={toggleAll} className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors text-left">
                    Asociar cargas del periodo (opcional)
                    <span className="float-right text-blue-400">{selectedIds.size}/{orders.length}</span>
                  </button>
                )}
              </div>

              {/* Orders list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {orders.length === 0 ? (
                  <div className="text-center py-16 text-gray-600 text-sm">Sin cargas disponibles<br /><span className="text-xs text-gray-700">Todas las cargas ya tienen pago</span></div>
                ) : (
                  orders.map(o => {
                    const isSelected = selectedIds.has(o.id)
                    const miles = (Number(o.miles) || 0) + (Number(o.dead_miles) || 0)
                    return (
                      <button key={o.id} onClick={() => toggleOrder(o.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${isSelected ? 'bg-cyan-600/10 border-cyan-600/35' : 'border-transparent hover:bg-gray-800/60 hover:border-gray-700/50'}`}>
                        <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-cyan-600 border-cyan-600' : 'border-gray-600'}`}>
                          {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white truncate">{o.order_number || o.id.slice(0, 8)}</span>
                            <span className="text-xs font-bold text-green-400 shrink-0">{fmt(o.rate || 0)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500 truncate">{o.pu_city || '—'} → {o.do_city || '—'}</span>
                            <span className="text-[10px] text-gray-600 shrink-0">{fmtShort(o.pu_date)}</span>
                          </div>
                          <p className="text-[9px] text-gray-700 mt-0.5">{miles.toLocaleString()} mi total · {Number(o.miles||0).toLocaleString()} loaded + {Number(o.dead_miles||0).toLocaleString()} DH</p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {/* Save */}
              <div className="px-5 py-4 border-t border-gray-800 shrink-0">
                <button onClick={savePayment} disabled={saving || (!Number(payRate))}
                  className="w-full py-2.5 bg-cyan-600 text-white text-sm font-bold rounded-xl hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Guardando...' : `Guardar Pago${payout > 0 ? ` (${fmt(payout)})` : ''}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Preview overlay */}
    {previewHtml && createPortal(
      <div className="fixed inset-0 z-[80] flex flex-col bg-black/80">
        <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <p className="text-sm font-semibold text-white">
            Vista previa — Settlement #{payments.find(p => htmlCache.current[p.id] === previewHtml)?.payment_number || ''}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => { const m = payments.find(p => htmlCache.current[p.id] === previewHtml); if (m) regenerate(m); setPreviewHtml(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-gray-200 text-xs font-semibold rounded-lg hover:bg-gray-600 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              Regenerar
            </button>
            <button onClick={() => setPreviewHtml(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              Cerrar
            </button>
          </div>
        </div>
        <iframe srcDoc={previewHtml} className="flex-1 w-full border-0 bg-white" title="Driver Settlement Preview" sandbox="allow-same-origin" />
      </div>,
      document.body
    )}
    </>
  )
}
