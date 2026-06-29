import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const fmtCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function OrderInvoice({ orderId, onClose }) {
  const [order, setOrder] = useState(null)
  const [truck, setTruck] = useState(null)
  const [broker, setBroker] = useState(null)
  const [stops, setStops] = useState([])
  const [invoiceItems, setInvoiceItems] = useState([])
  const [loading, setLoading] = useState(true)
  const printRef = useRef()

  useEffect(() => {
    async function load() {
      const [orderRes, stopsRes] = await Promise.all([
        supabase.from('orders').select('*').eq('id', orderId).single(),
        supabase.from('order_stops').select('*').eq('order_id', orderId).order('sequence'),
      ])
      const o = orderRes.data
      setOrder(o)
      setStops(stopsRes.data || [])

      if (o?.truck_id) {
        const { data } = await supabase.from('trucks').select('*').eq('id', o.truck_id).single()
        setTruck(data)
      }
      if (o?.broker_id) {
        const { data } = await supabase.from('brokers').select('*').eq('id', o.broker_id).single()
        setBroker(data)
      }
      setLoading(false)
    }
    load()
  }, [orderId])

  function handlePrint() {
    const content = printRef.current
    const win = window.open('', '_blank')
    win.document.write(`
      <html>
        <head>
          <title>Invoice ${order?.order_number || ''}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #fff; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `)
    win.document.close()
    setTimeout(() => { win.print() }, 300)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="bg-gray-900 rounded-xl p-8">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm mt-3">Generando invoice...</p>
        </div>
      </div>
    )
  }

  if (!order) return null

  const today = new Date().toISOString().split('T')[0]
  const invoiceDate = today
  const total = Number(order.rate) || 0
  const rateItems = invoiceItems.length > 0 ? invoiceItems : [{ pay_item: 'Flat Rate', units: 1, rate: total, total }]

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4 overflow-auto">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[95vh] overflow-auto shadow-2xl">
        {/* Toolbar */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between rounded-t-xl z-10">
          <span className="text-sm text-gray-300 font-medium">Invoice Preview</span>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m0 0a48.159 48.159 0 0 1 12.5 0m-12.5 0v-2.134c0-1.399.562-2.78 1.655-3.655C7.956 2.61 9.37 2 12 2c2.63 0 4.044.61 5.095 1.444A4.867 4.867 0 0 1 18.75 7.09" />
              </svg>
              Imprimir / PDF
            </button>
            <button onClick={onClose} className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white transition-colors">
              Cerrar
            </button>
          </div>
        </div>

        {/* Invoice content */}
        <div ref={printRef}>
          <div style={{ padding: '40px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', color: '#1a1a2e', fontSize: '13px', lineHeight: '1.5', maxWidth: '800px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.5px' }}>INVOICE</h1>
              <img src="/logo-invoice.png" alt="ETG Moving Services" style={{ width: '80px', height: '80px', borderRadius: '50%' }} />
            </div>

            {/* Invoice info */}
            <div style={{ marginBottom: '25px' }}>
              <table style={{ fontSize: '12px' }}>
                <tbody>
                  <tr><td style={{ color: '#dc2626', fontWeight: '600', paddingRight: '20px', paddingBottom: '2px' }}>Invoice Number</td><td>{order.order_number}</td></tr>
                  <tr><td style={{ color: '#dc2626', fontWeight: '600', paddingRight: '20px', paddingBottom: '2px' }}>Reference ID</td><td>{order.ref_number || '-'}</td></tr>
                  <tr><td style={{ color: '#dc2626', fontWeight: '600', paddingRight: '20px', paddingBottom: '2px' }}>Invoice Date</td><td>{invoiceDate}</td></tr>
                  <tr><td style={{ color: '#dc2626', fontWeight: '600', paddingRight: '20px', paddingBottom: '2px' }}>Terms</td><td>Due on receipt</td></tr>
                  <tr><td style={{ color: '#dc2626', fontWeight: '600', paddingRight: '20px', paddingBottom: '2px' }}>Truck #</td><td>{truck?.number || '-'}</td></tr>
                  <tr><td style={{ color: '#dc2626', fontWeight: '600', paddingRight: '20px', paddingBottom: '2px' }}>Driver</td><td>{order.driver_name || '-'}</td></tr>
                </tbody>
              </table>
            </div>

            {/* Bill From / Bill To */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                <p style={{ color: '#dc2626', fontWeight: '700', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>Bill From</p>
                <p style={{ fontWeight: '600' }}>ETG MOVING SERVICES</p>
                <p style={{ fontSize: '11px', color: '#64748b' }}>DRIVING IS WORK LLC</p>
              </div>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                <p style={{ color: '#dc2626', fontWeight: '700', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>Bill To</p>
                {broker ? (
                  <>
                    <p style={{ fontWeight: '600' }}>{broker.name}</p>
                    {broker.address && <p style={{ fontSize: '11px', color: '#64748b' }}>{broker.address}</p>}
                    {broker.phone && <p style={{ fontSize: '11px', color: '#64748b' }}>Phone: {broker.phone}</p>}
                    {broker.email && <p style={{ fontSize: '11px', color: '#64748b' }}>{broker.email}</p>}
                    {broker.mc_number && <p style={{ fontSize: '11px', color: '#64748b' }}>MC: {broker.mc_number}</p>}
                  </>
                ) : (
                  <p style={{ color: '#94a3b8' }}>-</p>
                )}
              </div>
            </div>

            {/* Line items table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700' }}>Description</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700' }}>Amount Per Unit</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {rateItems.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>{item.pay_item || item.description || 'Flat Rate'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{item.units || 1}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtCurrency(Number(item.rate) || Number(item.amount) || 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtCurrency(Number(item.total) || Number(item.amount) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '30px' }}>
              <div style={{ width: '250px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>Total</span>
                  <span style={{ fontWeight: '700' }}>{fmtCurrency(total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', background: '#dc2626', color: '#fff', borderRadius: '6px', marginTop: '4px', paddingLeft: '12px', paddingRight: '12px' }}>
                  <span style={{ fontWeight: '600' }}>Amount Due</span>
                  <span style={{ fontWeight: '800' }}>{fmtCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Stops */}
            {stops.length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ color: '#dc2626', fontWeight: '700', fontSize: '14px', marginBottom: '10px' }}>Stops</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '8px', color: '#3b82f6', fontWeight: '500' }}>{s.date || '-'}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ background: s.type === 'pickup' ? '#dbeafe' : '#dcfce7', color: s.type === 'pickup' ? '#1d4ed8' : '#15803d', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600' }}>
                            {s.type === 'pickup' ? 'Pickup' : 'Dropoff'}
                          </span>
                        </td>
                        <td style={{ padding: '8px', fontWeight: '500' }}>
                          {s.location_name || '-'}
                          {s.ref_number && <div style={{ fontSize: '9px', color: '#94a3b8' }}>Reference ID: {s.ref_number}</div>}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {s.address && s.address !== 'SEE SHIPPER BOL' ? s.address + ', ' : ''}
                          {[s.city, s.state].filter(Boolean).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payment Instructions */}
            {order.special_instructions && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#dc2626', fontWeight: '700', fontSize: '14px', marginBottom: '6px' }}>Payment Instructions & Terms</h3>
                <p style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'pre-wrap' }}>{order.special_instructions}</p>
              </div>
            )}

            {/* Footer */}
            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '15px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>
              <p>ETG Moving Services — Driving Is Work LLC</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
