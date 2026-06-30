import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const fmtCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

// Load pdf.js from CDN (avoids bundler compatibility issues)
let pdfjsPromise = null
function loadPdfJs() {
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      resolve(window.pdfjsLib)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
  return pdfjsPromise
}


async function pdfToImages(url) {
  try {
    const pdfjsLib = await loadPdfJs()
    const pdf = await pdfjsLib.getDocument(url).promise
    const images = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const scale = 2
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      images.push(canvas.toDataURL('image/png'))
    }
    return images
  } catch (err) {
    console.error('PDF render error:', err)
    return []
  }
}

async function imageToDataUrl(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(url)
      reader.readAsDataURL(blob)
    })
  } catch {
    return url
  }
}

// Cache to avoid regenerating every time
const invoiceCache = {}

export default function OrderInvoice({ orderId, onClose }) {
  const [order, setOrder] = useState(null)
  const [truck, setTruck] = useState(null)
  const [broker, setBroker] = useState(null)
  const [stops, setStops] = useState([])
  const [invoiceItems, setInvoiceItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [docImages, setDocImages] = useState({ rc: [], pod: [] })
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showEmailConfirm, setShowEmailConfirm] = useState(false)
  const [emailToggles, setEmailToggles] = useState({ remit: true, billFrom: true, billTo: true })
  const [regenerating, setRegenerating] = useState(false)
  const toast = useToast()
  const printRef = useRef()

  async function loadInvoice(useCache = true) {
    if (useCache && invoiceCache[orderId]) {
      const c = invoiceCache[orderId]
      setOrder(c.order)
      setTruck(c.truck)
      setBroker(c.broker)
      setStops(c.stops)
      setDocImages(c.docImages)
      setLoading(false)
      return
    }

    setLoading(true)
    const [orderRes, stopsRes, docsRes] = await Promise.all([
      supabase.from('orders').select('*').eq('id', orderId).single(),
      supabase.from('order_stops').select('*').eq('order_id', orderId).order('sequence'),
      supabase.from('order_documents').select('*').eq('order_id', orderId),
    ])
    const o = orderRes.data
    setOrder(o)
    setStops(stopsRes.data || [])

    let truckData = null
    let brokerData = null
    if (o?.truck_id) {
      const { data } = await supabase.from('trucks').select('*').eq('id', o.truck_id).single()
      truckData = data
      setTruck(data)
    }
    if (o?.broker_id) {
      const { data } = await supabase.from('brokers').select('*').eq('id', o.broker_id).single()
      brokerData = data
      setBroker(data)
    }

    const docs = docsRes.data || []
    const rcDocs = docs.filter(d => d.doc_type === 'RC')
    const podDocs = docs.filter(d => d.doc_type === 'POD')

    const processDoc = async (doc) => {
      const url = getPublicUrl(doc.file_path)
      if ((doc.mime_type || '').startsWith('image/')) {
        return [await imageToDataUrl(url)]
      } else {
        return await pdfToImages(url)
      }
    }

    const rcImages = []
    for (const doc of rcDocs) {
      rcImages.push(...(await processDoc(doc)))
    }
    const podImages = []
    for (const doc of podDocs) {
      podImages.push(...(await processDoc(doc)))
    }

    const imgs = { rc: rcImages, pod: podImages }
    setDocImages(imgs)

    // Cache result
    invoiceCache[orderId] = { order: o, truck: truckData, broker: brokerData, stops: stopsRes.data || [], docImages: imgs }
    setLoading(false)
  }

  async function handleRegenerate() {
    setRegenerating(true)
    delete invoiceCache[orderId]
    await loadInvoice(false)
    setRegenerating(false)
    toast.success('Invoice regenerado')
  }

  useEffect(() => { loadInvoice() }, [orderId])

  function getPublicUrl(filePath) {
    const { data } = supabase.storage.from('order-docs').getPublicUrl(filePath)
    return data?.publicUrl
  }

  async function generatePDF() {
    const pdf = new jsPDF('p', 'mm', 'letter')
    const pageW = 215.9
    const pageH = 279.4
    const margin = 10

    // Render the printable content into a temporary off-screen container with white bg
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;'
    container.innerHTML = printRef.current.innerHTML
    document.body.appendChild(container)

    // Wait for all images to load before rendering
    const imgs = container.querySelectorAll('img')
    await Promise.all(Array.from(imgs).map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise(resolve => {
        img.onload = resolve
        img.onerror = resolve
      })
    }))

    // Get all sections (invoice page + doc pages)
    const sections = [container.children[0]] // invoice section
    const docPages = container.querySelectorAll('.doc-page')
    docPages.forEach(p => sections.push(p))

    for (let i = 0; i < sections.length; i++) {
      if (i > 0) pdf.addPage()
      const canvas = await html2canvas(sections[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const imgData = canvas.toDataURL('image/jpeg', 0.85)
      const imgW = pageW - margin * 2
      const imgH = (canvas.height * imgW) / canvas.width
      // If image is taller than page, scale down to fit
      const finalH = imgH > pageH - margin * 2 ? pageH - margin * 2 : imgH
      const finalW = imgH > pageH - margin * 2 ? (canvas.width * finalH) / canvas.height : imgW
      pdf.addImage(imgData, 'JPEG', margin, margin, finalW, finalH)
    }

    document.body.removeChild(container)
    return pdf.output('datauristring').split(',')[1] // base64 only
  }

  async function handleSendEmail() {
    const remitEmail = remitInfo.remit_email || ''
    const billFromEmail = billingInfo.billing_email || ''
    const billToEmail = broker?.email || ''

    // Build recipients based on toggles
    const toList = []
    const ccList = []
    if (emailToggles.remit && remitEmail) toList.push(remitEmail)
    if (emailToggles.billFrom && billFromEmail) ccList.push(billFromEmail)
    if (emailToggles.billTo && billToEmail) ccList.push(billToEmail)

    if (toList.length === 0) {
      toast.warning('No hay destinatario principal. Configura el email del Remit To en Compania > Billing Information')
      return
    }

    setSendingEmail(true)
    toast.info(`Enviando a ${toEmail}...`)

    try {
      let pdfBase64
      try {
        pdfBase64 = await generatePDF()
      } catch (pdfErr) {
        console.error('PDF generation error:', pdfErr)
        toast.error('Error generando PDF: ' + (pdfErr.message || String(pdfErr)))
        setSendingEmail(false)
        return
      }

      const fileName = `Invoice_${order.order_number || 'ETG'}.pdf`
      const sizeMB = (pdfBase64.length * 0.75 / 1024 / 1024).toFixed(1)

      if (pdfBase64.length * 0.75 > 4 * 1024 * 1024) {
        toast.warning(`El PDF es muy grande (${sizeMB} MB). Intenta con menos documentos adjuntos.`)
        setSendingEmail(false)
        return
      }

      const res = await fetch('/api/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList,
          cc: ccList,
          subject: `Invoice #${order.order_number} — ${companyName}`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.6;">
              <p>Please find the attached invoice for your records.</p>
              <table style="margin: 16px 0; font-size: 13px;">
                <tr><td style="padding: 4px 12px 4px 0; color: #888;">Invoice #</td><td style="font-weight: 600;">${order.order_number || '-'}</td></tr>
                <tr><td style="padding: 4px 12px 4px 0; color: #888;">Amount Due</td><td style="font-weight: 600;">${fmtCurrency(Number(order.rate) || 0)}</td></tr>
                <tr><td style="padding: 4px 12px 4px 0; color: #888;">Terms</td><td>Due on receipt</td></tr>
              </table>
              <p style="font-size: 12px; color: #888; margin-top: 24px;">${companyName} — ${companyDba}</p>
            </div>
          `,
          pdfBase64,
          fileName,
        }),
      })

      let data
      try {
        data = await res.json()
      } catch {
        throw new Error(`Server error (${res.status}): ${res.statusText}`)
      }
      if (!res.ok) throw new Error(data.error || `Error del servidor (${res.status})`)
      toast.success(`Invoice enviado a ${toList.join(', ')}${ccList.length ? ` (CC: ${ccList.join(', ')})` : ''}`)
    } catch (err) {
      console.error('Send email error:', err)
      toast.error('Error enviando email: ' + (err.message || String(err)))
    } finally {
      setSendingEmail(false)
    }
  }

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
            img { max-width: 100%; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .doc-page { page-break-before: always; }
            }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `)
    win.document.close()
    const imgs = win.document.querySelectorAll('img')
    if (imgs.length === 0) { setTimeout(() => win.print(), 300); return }
    let loaded = 0
    const onLoad = () => { if (++loaded >= imgs.length) setTimeout(() => win.print(), 200) }
    imgs.forEach(img => { if (img.complete) onLoad(); else { img.onload = onLoad; img.onerror = onLoad } })
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm mt-3">Generando invoice...</p>
          <p className="text-gray-600 text-xs mt-1">Renderizando documentos adjuntos</p>
        </div>
      </div>
    )
  }

  if (!order) return null

  const today = new Date().toISOString().split('T')[0]
  const invoiceDate = today
  const total = Number(order.rate) || 0
  const companyName = localStorage.getItem('company_name') || 'ETG MOVING SERVICES'
  const companyDba = localStorage.getItem('company_dba') || 'DRIVING IS WORK LLC'
  const billingInfo = JSON.parse(localStorage.getItem('billing_info') || '{}')
  const remitInfo = JSON.parse(localStorage.getItem('remit_info') || '{}')
  const rateItems = invoiceItems.length > 0 ? invoiceItems : [{ pay_item: 'Flat Rate', units: 1, rate: total, total }]

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4 overflow-auto">
      <div style={{ backgroundColor: '#ffffff' }} className="rounded-xl w-full max-w-3xl max-h-[95vh] overflow-auto shadow-2xl">
        {/* Toolbar */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between rounded-t-xl z-10">
          <span className="text-sm text-gray-300 font-medium">Invoice Preview</span>
          <div className="flex gap-2">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
              Regenerar
            </button>
            <button
              onClick={() => setShowEmailConfirm(true)}
              disabled={sendingEmail}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              Enviar Email
            </button>
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

        {/* All printable content */}
        <div ref={printRef}>
          {/* Page 1: Invoice */}
          <div style={{ padding: '40px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', color: '#1a1a2e', fontSize: '13px', lineHeight: '1.5', maxWidth: '800px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.5px' }}>INVOICE</h1>
              <img src={localStorage.getItem('invoice_logo') || '/logo-invoice.png'} alt="Logo" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} />
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
                  <tr><td style={{ color: '#dc2626', fontWeight: '600', paddingRight: '20px', paddingBottom: '2px' }}>Driver</td><td>{order.driver_name || truck?.name || '-'}</td></tr>
                </tbody>
              </table>
            </div>

            {/* Bill From / Bill To / Remit To — single row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '25px' }}>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: '6px', padding: '10px' }}>
                <p style={{ color: '#dc2626', fontWeight: '700', fontSize: '9px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bill From</p>
                <p style={{ fontWeight: '600', fontSize: '11px', lineHeight: '1.3' }}>{billingInfo.billing_name || companyName.toUpperCase()}</p>
                <p style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4' }}>
                  {[billingInfo.billing_address, [billingInfo.billing_city, billingInfo.billing_state, billingInfo.billing_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                  {!billingInfo.billing_name && companyDba ? companyDba.toUpperCase() : ''}
                </p>
                {(billingInfo.billing_phone || billingInfo.billing_email) && (
                  <p style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4' }}>
                    {[billingInfo.billing_phone, billingInfo.billing_email].filter(Boolean).join(' | ')}
                  </p>
                )}
              </div>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: '6px', padding: '10px' }}>
                <p style={{ color: '#dc2626', fontWeight: '700', fontSize: '9px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bill To</p>
                {broker ? (
                  <>
                    <p style={{ fontWeight: '600', fontSize: '11px', lineHeight: '1.3' }}>{broker.name}</p>
                    <p style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4' }}>
                      {[broker.address, broker.mc_number ? `MC: ${broker.mc_number}` : ''].filter(Boolean).join(' | ')}
                    </p>
                    {(broker.phone || broker.email) && (
                      <p style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4' }}>
                        {[broker.phone, broker.email].filter(Boolean).join(' | ')}
                      </p>
                    )}
                  </>
                ) : <p style={{ color: '#94a3b8', fontSize: '11px' }}>-</p>}
              </div>
              {remitInfo.remit_name && (
                <div style={{ flex: 1, background: '#f8fafc', borderRadius: '6px', padding: '10px' }}>
                  <p style={{ color: '#dc2626', fontWeight: '700', fontSize: '9px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remit To</p>
                  <p style={{ fontWeight: '600', fontSize: '11px', lineHeight: '1.3' }}>{remitInfo.remit_name}</p>
                  <p style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4' }}>
                    {[remitInfo.remit_address, [remitInfo.remit_city, remitInfo.remit_state, remitInfo.remit_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                  </p>
                  {remitInfo.remit_email && <p style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4' }}>{remitInfo.remit_email}</p>}
                </div>
              )}
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

            {/* Footer */}
            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '15px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>
              <p>{companyName} &mdash; {companyDba}</p>
            </div>
          </div>

          {/* RC pages */}
          {docImages.rc.map((src, i) => (
            <div key={`rc-${i}`} className="doc-page" style={{ pageBreakBefore: 'always', padding: '30px' }}>
              {i === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                  <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>RC</span>
                  <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e' }}>Rate Confirmation</h2>
                </div>
              )}
              <img src={src} alt={`RC page ${i + 1}`} style={{ width: '100%' }} />
            </div>
          ))}

          {/* POD pages */}
          {docImages.pod.map((src, i) => (
            <div key={`pod-${i}`} className="doc-page" style={{ pageBreakBefore: 'always', padding: '30px' }}>
              {i === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                  <span style={{ background: '#ffedd5', color: '#c2410c', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>POD</span>
                  <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e' }}>Proof of Delivery</h2>
                </div>
              )}
              <img src={src} alt={`POD page ${i + 1}`} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Email confirmation modal */}
      {showEmailConfirm && (() => {
        const remitEmail = remitInfo.remit_email || ''
        const billFromEmail = billingInfo.billing_email || ''
        const billToEmail = broker?.email || ''
        const hasAnyTo = emailToggles.remit && remitEmail

        const EmailRow = ({ label, type, email, tag }) => (
          <div className="flex items-center justify-between py-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">{label}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${tag === 'To' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-blue-900/40 text-blue-400'}`}>{tag}</span>
              </div>
              {email ? (
                <p className={`text-sm ${emailToggles[type] ? 'text-gray-200' : 'text-gray-600 line-through'}`}>{email}</p>
              ) : (
                <p className="text-xs text-gray-600">Sin email</p>
              )}
            </div>
            {email && (
              <button
                onClick={() => setEmailToggles(prev => ({ ...prev, [type]: !prev[type] }))}
                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${emailToggles[type] ? 'bg-emerald-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${emailToggles[type] ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            )}
          </div>
        )

        return (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                <h3 className="text-sm font-semibold text-white">Confirmar envio</h3>
              </div>

              <div className="bg-gray-800/50 rounded-lg px-3 divide-y divide-gray-700/50">
                <EmailRow label="Remit To" type="remit" email={remitEmail} tag="To" />
                <EmailRow label="Bill From" type="billFrom" email={billFromEmail} tag="CC" />
                <EmailRow label="Bill To (Broker)" type="billTo" email={billToEmail} tag="CC" />
              </div>

              <p className="text-[10px] text-gray-600">Invoice #{order?.order_number} — incluye RC y POD adjuntos</p>

              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowEmailConfirm(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={() => { setShowEmailConfirm(false); handleSendEmail() }}
                  disabled={sendingEmail || !hasAnyTo}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {sendingEmail ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enviando...
                    </>
                  ) : 'Confirmar y Enviar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
