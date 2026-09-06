import { useState, useEffect } from 'react'

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

// Renders a PDF URL as images using pdf.js — no browser PDF viewer
export default function PdfViewer({ url, className = '' }) {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!url) return
    setPages([])
    setLoading(true)
    setError(null)

    let cancelled = false
    async function render() {
      try {
        const pdfjsLib = await loadPdfJs()
        const pdf = await pdfjsLib.getDocument(url).promise
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const scale = 1.8
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
          if (cancelled) return
          setPages(prev => [...prev, canvas.toDataURL('image/png')])
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
      if (!cancelled) setLoading(false)
    }
    render()
    return () => { cancelled = true }
  }, [url])

  if (error) return (
    <div className={`flex items-center justify-center py-8 text-gray-500 text-sm ${className}`}>
      Error al cargar PDF. <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-400 hover:underline">Descargar</a>
    </div>
  )

  return (
    <div className={`overflow-y-auto bg-gray-950 rounded ${className}`}>
      {loading && pages.length === 0 && (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          Cargando PDF...
        </div>
      )}
      <div className="flex flex-col gap-2 p-2">
        {pages.map((src, i) => (
          <img key={i} src={src} alt={`Página ${i + 1}`} className="w-full rounded shadow-sm" />
        ))}
        {loading && pages.length > 0 && (
          <div className="flex items-center justify-center py-4 gap-2 text-gray-600 text-xs">
            <div className="w-3 h-3 border border-orange-500 border-t-transparent rounded-full animate-spin" />
            Cargando página {pages.length + 1}...
          </div>
        )}
      </div>
    </div>
  )
}
