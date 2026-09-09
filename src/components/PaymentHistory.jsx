import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getActiveCompanyId } from '../lib/company'

const fmt = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

export default function PaymentHistory() {
  const { session } = useAuth()
  const meta = session?.user?.user_metadata || {}
  const email = session?.user?.email
  const role = meta.role
  const isDriver = role === 'driver' || role === 'driver_lease'

  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(null)
  const htmlCache = useRef({})

  const companyId = getActiveCompanyId()

  useEffect(() => {
    if (!email) return
    ;(async () => {
      setLoading(true)
      if (isDriver) {
        let q = supabase.from('driver_payments')
          .select('*').eq('driver_email', email)
          .order('pay_date', { ascending: false })
        if (companyId) q = q.eq('company_id', companyId)
        const { data } = await q
        setPayments((data || []).map(p => ({ ...p, type: 'driver' })))
      } else {
        let q = supabase.from('dispatcher_payments')
          .select('*').eq('dispatcher_email', email)
          .order('pay_date', { ascending: false })
        if (companyId) q = q.eq('company_id', companyId)
        const { data } = await q
        setPayments((data || []).map(p => ({ ...p, type: 'dispatcher' })))
      }
      setLoading(false)
    })()
  }, [email, isDriver, companyId])

  async function fetchPreview(payment) {
    if (htmlCache.current[payment.id]) {
      setPreviewHtml(htmlCache.current[payment.id])
      return
    }
    setPreviewLoading(payment.id)
    try {
      const { data: pOrders } = await supabase
        .from('orders')
        .select('id, order_number, pu_city, do_city, pu_date, do_date, rate, miles, dead_miles')
        .in('id', payment.order_ids || [])

      const cId = getActiveCompanyId()
      const endpoint = payment.type === 'driver' ? '/api/send-driver-settlement' : '/api/send-settlement'
      const body = payment.type === 'driver'
        ? {
            action: 'preview',
            type: 'driver',
            paymentNumber: payment.payment_number,
            driverName: payment.driver_name,
            driverEmail: payment.driver_email,
            payMode: payment.pay_mode,
            payRate: payment.pay_rate,
            gross: payment.gross_revenue,
            totalMiles: payment.total_miles,
            payout: payment.payout,
            payDate: payment.pay_date,
            periodStart: payment.period_start,
            periodEnd: payment.period_end,
            orders: pOrders || [],
            companyId: cId,
          }
        : {
            action: 'preview',
            type: 'dispatcher',
            paymentNumber: payment.payment_number,
            dispatcherEmail: payment.dispatcher_email,
            dispatcherName: payment.dispatcher_name,
            gross: payment.gross_revenue,
            commissionPct: payment.commission_pct,
            payout: payment.payout,
            payDate: payment.pay_date,
            periodStart: payment.period_start,
            periodEnd: payment.period_end,
            orders: pOrders || [],
            companyId: cId,
          }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.html) throw new Error(data.error || 'Error')
      htmlCache.current[payment.id] = data.html
      setPreviewHtml(data.html)
    } catch (e) {
      console.error('Error fetching preview:', e)
    }
    setPreviewLoading(null)
  }

  const totalPayout = payments.reduce((s, p) => s + (p.payout || 0), 0)

  return (
    <div className="animate-tab-in">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Historial de Pagos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {payments.length} pago{payments.length !== 1 ? 's' : ''} registrado{payments.length !== 1 ? 's' : ''}
            {payments.length > 0 && <span className="text-gray-600"> · Total: <span className="text-green-400 font-semibold">{fmt(totalPayout)}</span></span>}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 text-gray-800 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
          </svg>
          <p className="text-sm text-gray-500">No hay pagos registrados</p>
          <p className="text-xs text-gray-700 mt-1">Los pagos aparecerán aquí cuando el administrador los registre</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map(p => {
            const dateStr = new Date(p.pay_date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
            const periodStart = new Date(p.period_start + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
            const periodEnd = new Date(p.period_end + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
            const orderCount = p.order_ids?.length || 0
            const isDriverPay = p.type === 'driver'
            const isLoading = previewLoading === p.id

            return (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
                <div className="p-4 sm:p-5">
                  {/* Top row — number, date, payout */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-600/10 border border-green-600/20 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-green-400">#{p.payment_number}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{dateStr}</p>
                        <p className="text-xs text-gray-500">{periodStart} — {periodEnd}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-400">{fmt(p.payout)}</p>
                      <p className="text-[10px] text-gray-600">
                        {isDriverPay
                          ? (p.pay_mode === 'percentage' ? `${p.pay_rate}% de ${fmt(p.gross_revenue)}` : `${fmt(p.pay_rate)}/mi · ${p.total_miles?.toLocaleString()} mi`)
                          : `${p.commission_pct}% de ${fmt(p.gross_revenue)}`
                        }
                      </p>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                      {orderCount} orden{orderCount !== 1 ? 'es' : ''}
                    </span>
                    {isDriverPay && p.total_miles && (
                      <span>{p.total_miles.toLocaleString()} millas</span>
                    )}
                    {p.email_sent_at && (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        Email enviado
                      </span>
                    )}
                  </div>
                </div>

                {/* Action bar */}
                <div className="border-t border-gray-800 px-4 sm:px-5 py-2.5 flex items-center justify-end gap-2 bg-gray-900/50">
                  <button
                    onClick={() => fetchPreview(p)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-orange-600/50 hover:bg-orange-600/5 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    )}
                    Ver Settlement
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewHtml && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <p className="text-sm font-semibold text-white">
                Settlement #{payments.find(p => htmlCache.current[p.id] === previewHtml)?.payment_number || ''}
              </p>
              <button
                onClick={() => setPreviewHtml(null)}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              title="Settlement preview"
              srcDoc={previewHtml}
              className="flex-1 w-full bg-white"
              style={{ minHeight: '500px' }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
