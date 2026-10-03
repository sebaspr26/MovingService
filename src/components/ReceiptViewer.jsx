import { useState } from 'react'
import { createPortal } from 'react-dom'
import { receiptUrl, isPdfReceipt } from '../lib/receipts'
import { downloadFromUrl } from '../lib/download'
import PdfViewer from './PdfViewer'

// Full-screen view of a stored expense receipt (photo or PDF)
export default function ReceiptViewer({ path, title = 'Recibo', onClose }) {
  const [downloading, setDownloading] = useState(false)
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
    <div className="fixed inset-0 z-[9990] bg-black/80 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-medium text-gray-200 truncate">{title}</p>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleDownload} disabled={downloading} className="px-3 py-1.5 bg-gray-800 text-gray-200 rounded-lg text-xs font-medium hover:bg-gray-700 disabled:opacity-50">
            {downloading ? 'Descargando...' : 'Descargar'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white">Cerrar</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center" onClick={e => e.stopPropagation()}>
        {pdf
          ? <PdfViewer url={url} className="w-full max-w-3xl" />
          : <img src={url} alt={title} className="max-w-full max-h-full object-contain rounded-lg" />}
      </div>
    </div>,
    document.body,
  )
}
