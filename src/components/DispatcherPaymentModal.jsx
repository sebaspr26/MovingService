import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/orders'
import { useToast } from './Toast'

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

export default function DispatcherPaymentModal({ user, onClose }) {
  const [payments, setPayments] = useState([])
  const [orders, setOrders] = useState([])
  const [brokers, setBrokers] = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  const toast = useToast()

  const meta = user.user_metadata || {}
  const dispatcherName = meta.name || user.email || ''
  const dispatcherEmail = user.email || ''

  // Current commission: match current month, fallback to latest
  const rates = meta.dispatcher_rates || []
  const currentMonth = new Date().toISOString().slice(0, 7)
  const currentRate = rates.find(r => r.month === currentMonth) || rates[rates.length - 1]
  const commissionPct = currentRate?.pct || 0

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [paymentsRes, ordersRes, brokersRes] = await Promise.all([
      supabase.from('dispatcher_payments')
        .select('*')
        .eq('dispatcher_email', dispatcherEmail)
        .order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('id, order_number, pu_city, do_city, pu_date, do_date, rate, miles, dead_miles, broker_id, status, truck_id')
        .eq('dispatcher', dispatcherEmail)
        .in('status', ['paid', 'invoiced'])
        .order('pu_date', { ascending: false }),
      supabase.from('brokers').select('id, name'),
    ])

    const existingPayments = paymentsRes.data || []
    // IDs already included in a previous payment
    const usedIds = new Set(existingPayments.flatMap(p => p.order_ids || []))
    const unpaid = (ordersRes.data || []).filter(o => !usedIds.has(o.id))

    const bMap = {}
    ;(brokersRes.data || []).forEach(b => { bMap[b.id] = b })

    setPayments(existingPayments)
    setOrders(unpaid)
    setBrokers(bMap)
    setLoading(false)
  }

  const selectedOrders = orders.filter(o => selectedIds.has(o.id))
  const gross = selectedOrders.reduce((s, o) => s + (Number(o.rate) || 0), 0)
  const payout = gross * commissionPct / 100

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
    if (!selectedIds.size) return toast.warning('Selecciona al menos una orden')
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const sorted = [...selectedOrders].sort((a, b) => (a.pu_date || '') < (b.pu_date || '') ? -1 : 1)
    const periodStart = sorted[0]?.pu_date || today
    const periodEnd = sorted[sorted.length - 1]?.do_date || sorted[sorted.length - 1]?.pu_date || today

    const { error } = await supabase.from('dispatcher_payments').insert({
      dispatcher_email: dispatcherEmail,
      dispatcher_name: dispatcherName,
      gross_revenue: gross,
      commission_pct: commissionPct,
      payout,
      pay_date: today,
      period_start: periodStart,
      period_end: periodEnd,
      order_ids: [...selectedIds],
      payment_number: payments.length + 1,
    })

    if (error) { toast.error('Error: ' + error.message); setSaving(false); return }
    toast.success('Pago registrado correctamente')
    setShowNew(false)
    setSelectedIds(new Set())
    await fetchData()
    setSaving(false)
  }

  async function sendSettlement(payment) {
    setSendingId(payment.id)
    try {
      const { data: pOrders } = await supabase
        .from('orders')
        .select('id, order_number, pu_city, do_city, pu_date, do_date, rate, miles, dead_miles')
        .in('id', payment.order_ids || [])

      const res = await fetch('/api/send-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dispatcher',
          paymentNumber: payment.payment_number,
          dispatcherEmail,
          dispatcherName,
          gross: payment.gross_revenue,
          commissionPct: payment.commission_pct,
          payout: payment.payout,
          payDate: payment.pay_date,
          periodStart: payment.period_start,
          periodEnd: payment.period_end,
          orders: pOrders || [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      toast.success('Settlement enviado a ' + dispatcherEmail)
    } catch (e) {
      toast.error('Error al enviar: ' + e.message)
    }
    setSendingId(null)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {dispatcherName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{dispatcherName}</h2>
              <p className="text-xs text-gray-500">{dispatcherEmail} · Comisión: <span className="text-orange-400 font-semibold">{commissionPct}%</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowNew(v => !v); setSelectedIds(new Set()) }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold transition-colors ${showNew ? 'bg-gray-700 text-gray-300' : 'bg-orange-600 text-white hover:bg-orange-500'}`}
              title="Nuevo pago"
            >
              {showNew ? '×' : '+'}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* Left: Payment history */}
          <div className={`flex flex-col overflow-hidden ${showNew ? 'flex-1 border-r border-gray-800' : 'flex-1'}`}>
            <div className="px-5 py-3 border-b border-gray-800 shrink-0 flex items-center justify-between">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Historial de Pagos</p>
              <span className="text-[10px] text-gray-600">{payments.length} registro{payments.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-14 h-14 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
                    <svg className="w-7 h-7 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Sin pagos registrados</p>
                  <p className="text-gray-600 text-xs mt-1">Presiona <span className="text-orange-400 font-bold">+</span> para registrar el primer pago</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payments.map(p => (
                    <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        {/* Left info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-orange-600/15 border border-orange-600/25 flex items-center justify-center shrink-0">
                            <span className="text-orange-400 text-[11px] font-bold">#{p.payment_number}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-base font-bold text-green-400">{fmt(p.payout)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Gross: <span className="text-gray-300">{fmt(p.gross_revenue)}</span>
                              <span className="mx-1.5 text-gray-700">·</span>
                              {p.commission_pct}%
                              <span className="mx-1.5 text-gray-700">·</span>
                              {(p.order_ids || []).length} orden{(p.order_ids || []).length !== 1 ? 'es' : ''}
                            </p>
                            {(p.period_start || p.period_end) && (
                              <p className="text-[10px] text-gray-600 mt-1">{fmtDate(p.period_start)} — {fmtDate(p.period_end)}</p>
                            )}
                          </div>
                        </div>
                        {/* Right: date + send */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <p className="text-xs text-gray-400">{fmtDate(p.pay_date)}</p>
                          <button
                            onClick={() => sendSettlement(p)}
                            disabled={sendingId === p.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
                          >
                            {sendingId === p.id
                              ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                              : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                            }
                            Enviar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: New payment panel */}
          {showNew && (
            <div className="w-[380px] shrink-0 flex flex-col overflow-hidden bg-gray-900/30">

              {/* Summary cards */}
              <div className="px-5 py-4 border-b border-gray-800 shrink-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-3">Nuevo Pago</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-800/70 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Gross</p>
                    <p className="text-sm font-bold text-white">{fmt(gross)}</p>
                  </div>
                  <div className="bg-gray-800/70 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Comisión</p>
                    <p className="text-sm font-bold text-orange-400">{commissionPct}%</p>
                  </div>
                  <div className="bg-orange-600/15 border border-orange-600/30 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-orange-400 uppercase tracking-wide mb-1">Pago</p>
                    <p className="text-sm font-bold text-orange-400">{fmt(payout)}</p>
                  </div>
                </div>
                {orders.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="mt-2.5 w-full text-xs text-gray-500 hover:text-gray-300 transition-colors text-left"
                  >
                    {selectedIds.size === orders.length ? 'Deseleccionar todas' : `Seleccionar todas (${orders.length})`}
                    <span className="float-right text-orange-400">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</span>
                  </button>
                )}
              </div>

              {/* Orders list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {orders.length === 0 ? (
                  <div className="text-center py-16 text-gray-600 text-sm">Sin órdenes disponibles<br /><span className="text-xs text-gray-700">Todas las órdenes ya tienen pago</span></div>
                ) : (
                  orders.map(o => {
                    const isSelected = selectedIds.has(o.id)
                    const broker = brokers[o.broker_id]
                    return (
                      <button
                        key={o.id}
                        onClick={() => toggleOrder(o.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${
                          isSelected
                            ? 'bg-orange-600/10 border-orange-600/35 shadow-sm'
                            : 'border-transparent hover:bg-gray-800/60 hover:border-gray-700/50'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                          isSelected ? 'bg-orange-600 border-orange-600' : 'border-gray-600'
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white truncate">{o.order_number || o.id.slice(0, 8)}</span>
                            <span className="text-xs font-bold text-green-400 shrink-0">{fmt(o.rate || 0)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500 truncate">{o.pu_city || '—'} → {o.do_city || '—'}</span>
                            <span className="text-[10px] text-gray-600 shrink-0">{fmtShort(o.pu_date)}</span>
                          </div>
                          {broker && <p className="text-[9px] text-gray-700 truncate mt-0.5">{broker.name}</p>}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {/* Save button */}
              <div className="px-5 py-4 border-t border-gray-800 shrink-0">
                <button
                  onClick={savePayment}
                  disabled={saving || !selectedIds.size}
                  className="w-full py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Guardando...' : `Guardar Pago${selectedIds.size > 0 ? ` (${fmt(payout)})` : ''}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
