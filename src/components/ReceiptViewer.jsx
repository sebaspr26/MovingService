import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { receiptUrl, isPdfReceipt } from '../lib/receipts'
import { downloadFromUrl } from '../lib/download'
import PdfViewer from './PdfViewer'

// Stored expense receipt (photo or PDF) in a centered, medium-size modal
export default function ReceiptViewer({ path, title = 'Recibo', onClose }) {
  const [downloading, setDownloading] = useState(false)
  // Whole receipt fits by default; click to zoom to full width for the details
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!path) return null
  const url = receiptUrl(path)
  const pdf = isPdfReceipt(path)

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadFromUrl(url, `${title.replace(/[^\w-]+/g, '_')}${pdf ? '.pdf' : '.jpg'}`)
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[80vh] flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-800">
          <p className="text-sm font-medium text-gray-200 truncate">{title}</p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloading}
              title="Descargar"
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {downloading ? (
                <span className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              )}
            </button>
            <button onClick={onClose} title="Cerrar" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* Centered only while it fits: a centered zoomed image can't be scrolled to its left edge */}
        <div className={`flex-1 min-h-0 overflow-auto overscroll-none bg-gray-950 p-3 flex items-start ${zoomed ? 'justify-start' : 'justify-center'}`}>
          {pdf
            ? <PdfViewer url={url} className="w-full" />
            : (
              <img
                src={url}
                alt={title}
                onClick={() => setZoomed(z => !z)}
                title={zoomed ? 'Clic para ajustar a la ventana' : 'Clic para ampliar'}
                className={`rounded-md ${zoomed ? 'max-w-none w-[160%] cursor-zoom-out' : 'max-w-full max-h-[calc(80vh-4.5rem)] object-contain cursor-zoom-in'}`}
              />
            )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
