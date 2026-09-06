import { useState, useEffect, useRef } from 'react'

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

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5
const ZOOM_STEP = 0.12

export default function PdfViewer({ url, className = '' }) {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef()

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
          // High quality: render at 3x then let CSS handle display size
          const scale = 3
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

  // Mouse wheel zoom — prevent default so it zooms instead of scrolling page
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
      setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + delta).toFixed(2))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomIn  = () => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))
  const reset   = () => setZoom(1)

  if (error) return (
    <div className={`flex items-center justify-center py-8 text-gray-500 text-sm ${className}`}>
      Error al cargar PDF.&nbsp;
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Descargar</a>
    </div>
  )

  return (
    <div className={`relative flex flex-col overflow-hidden bg-gray-950 ${className}`}>

      {/* Zoom toolbar */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-gray-900/95 border border-gray-700 rounded-lg px-2 py-1 shadow-lg backdrop-blur-sm">
        <button
          onClick={zoomOut}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors text-base font-bold"
          title="Alejar"
        >−</button>
        <button
          onClick={reset}
          className="text-xs text-gray-300 hover:text-white transition-colors w-12 text-center tabular-nums"
          title="Restablecer zoom"
        >{Math.round(zoom * 100)}%</button>
        <button
          onClick={zoomIn}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors text-base font-bold"
          title="Acercar"
        >+</button>
      </div>

      {/* Scrollable canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto cursor-zoom-in select-none">
        {loading && pages.length === 0 && (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-500 text-sm">
            <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            Cargando PDF...
          </div>
        )}

        {/* Pages container — width drives zoom */}
        <div
          style={{ width: `${zoom * 100}%`, minWidth: '100%', transition: 'width 0.05s ease-out' }}
          className="flex flex-col gap-2 p-3 mx-auto"
        >
          {pages.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Página ${i + 1}`}
              draggable={false}
              className="w-full rounded shadow-md block"
              style={{ imageRendering: 'high-quality' }}
            />
          ))}
          {loading && pages.length > 0 && (
            <div className="flex items-center justify-center py-4 gap-2 text-gray-600 text-xs">
              <div className="w-3 h-3 border border-orange-500 border-t-transparent rounded-full animate-spin" />
              Página {pages.length + 1}...
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
