import { useState, useEffect, useRef, useCallback } from 'react'
import { loadImageCanvas, detectCorners, fullCorners, rotateCanvas, warpToRect, enhance, canvasToFile } from '../lib/docScan'

// "CamScanner" for a POD photo before uploading it: 1) Recortar — the sheet's
// corners are found automatically and can be dragged; 2) Mejorar — straightened
// and cleaned up (color / gris / blanco y negro). Math lives in lib/docScan.js.
//
// Use through the hook:
//   const { scannerEl, scanFile } = useDocScanner()
//   const file = await scanFile(original)   // improved File, the original, or null (canceled)
//   ...render {scannerEl}
// Anything that isn't an image (PDF) comes back untouched without opening it.

const MODES = [
  { key: 'color', label: 'Color', hint: 'Quita sombras, conserva sellos y firmas' },
  { key: 'gray', label: 'Gris', hint: 'Más limpio, sin color' },
  { key: 'bw', label: 'Blanco y negro', hint: 'El más legible para texto borroso' },
  { key: 'none', label: 'Sin filtro', hint: 'Solo recortado y derecho' },
]

export function useDocScanner() {
  const [job, setJob] = useState(null) // { file, resolve }
  const scanFile = useCallback(file => {
    if (!file || !file.type?.startsWith('image/')) return Promise.resolve(file)
    return new Promise(resolve => setJob({ file, resolve }))
  }, [])
  const finish = result => { job?.resolve(result); setJob(null) }
  const scannerEl = job ? <DocScanner key={job.file.name + job.file.lastModified} file={job.file} onDone={finish} /> : null
  return { scannerEl, scanFile }
}

function DocScanner({ file, onDone }) {
  const [canvas, setCanvas] = useState(null)   // working photo
  const [corners, setCorners] = useState(null) // [TL, TR, BR, BL] in canvas pixels
  const [photoUrl, setPhotoUrl] = useState(null)
  const [step, setStep] = useState('crop')
  const [mode, setMode] = useState('color')
  const [result, setResult] = useState(null)   // { url, canvas } for the current mode
  const [busy, setBusy] = useState('Abriendo la foto...')
  const [error, setError] = useState(null)
  const warpedRef = useRef(null)
  const cacheRef = useRef({})

  // Load + auto-detect
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const c = await loadImageCanvas(file)
        if (!alive) return
        await tick()
        setCanvas(c)
        setCorners(detectCorners(c))
        setPhotoUrl(c.toDataURL('image/jpeg', 0.85))
      } catch {
        if (alive) setError('No se pudo abrir esta imagen. Puedes subirla tal cual.')
      } finally {
        if (alive) setBusy(null)
      }
    })()
    return () => { alive = false }
  }, [file])

  // Esc cancels
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onDone(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  async function rotate() {
    setBusy('Rotando...')
    await tick()
    const c = rotateCanvas(canvas, true)
    setCanvas(c)
    setCorners(detectCorners(c))
    setPhotoUrl(c.toDataURL('image/jpeg', 0.85))
    setBusy(null)
  }

  async function renderMode(m) {
    if (cacheRef.current[m]) { setResult(cacheRef.current[m]); return }
    setBusy('Mejorando la imagen...')
    await tick()
    const out = m === 'none' ? warpedRef.current : enhance(warpedRef.current, m)
    const r = { canvas: out, url: out.toDataURL('image/jpeg', 0.85) }
    cacheRef.current[m] = r
    setResult(r)
    setBusy(null)
  }

  async function goEnhance() {
    setBusy('Enderezando la hoja...')
    await tick()
    warpedRef.current = warpToRect(canvas, corners)
    cacheRef.current = {}
    setStep('enhance')
    await renderMode(mode)
  }

  async function pickMode(m) {
    setMode(m)
    await renderMode(m)
  }

  async function save() {
    setBusy('Preparando el archivo...')
    await tick()
    try {
      onDone(await canvasToFile(result.canvas, file.name, mode))
    } catch {
      setBusy(null)
      setError('No se pudo generar la imagen mejorada. Puedes subir la original.')
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4 bg-black/70 animate-modal-backdrop" onClick={() => onDone(null)}>
      <div className="relative w-full h-full sm:h-[92vh] sm:max-w-3xl bg-gray-950 sm:border sm:border-gray-800 sm:rounded-2xl flex flex-col overflow-hidden safe-top safe-bottom animate-modal-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">Mejorar POD</h3>
            <p className="text-[11px] text-gray-500">
              <span className={step === 'crop' ? 'text-orange-400 font-semibold' : ''}>1. Recortar</span>
              <span className="mx-1.5">→</span>
              <span className={step === 'enhance' ? 'text-orange-400 font-semibold' : ''}>2. Mejorar</span>
            </p>
          </div>
          <button onClick={() => onDone(null)} className="text-gray-500 hover:text-gray-300" aria-label="Cancelar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="relative flex-1 min-h-0 bg-gray-900/40 flex items-center justify-center p-3">
          {error ? (
            <p className="text-sm text-red-400 text-center px-6">{error}</p>
          ) : step === 'crop' ? (
            photoUrl && corners && <CornerEditor url={photoUrl} width={canvas.width} height={canvas.height} corners={corners} onChange={setCorners} />
          ) : (
            result && <img src={result.url} alt="POD mejorado" className="max-w-full max-h-full object-contain rounded shadow-2xl bg-white" />
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-gray-950) 60%, transparent)' }}>
              <div className="flex items-center gap-2.5 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 shadow-xl">
                <span className="w-4 h-4 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
                <span className="text-sm text-gray-200">{busy}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tools */}
        {!error && step === 'crop' && (
          <div className="flex flex-wrap items-center justify-center gap-2 px-4 pt-3 shrink-0">
            <ToolButton onClick={() => setCorners(detectCorners(canvas))} disabled={!canvas || !!busy}>Detectar bordes</ToolButton>
            <ToolButton onClick={() => setCorners(fullCorners(canvas))} disabled={!canvas || !!busy}>Toda la foto</ToolButton>
            <ToolButton onClick={rotate} disabled={!canvas || !!busy}>Rotar ↻</ToolButton>
            <p className="basis-full text-center text-[11px] text-gray-500">Arrastra los puntos naranjas a las esquinas de la hoja</p>
          </div>
        )}
        {!error && step === 'enhance' && (
          <div className="px-4 pt-3 shrink-0">
            <div className="flex flex-wrap justify-center gap-2">
              {MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => pickMode(m.key)}
                  disabled={!!busy}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60 ${
                    mode === m.key ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                  }`}
                >{m.label}</button>
              ))}
            </div>
            <p className="text-center text-[11px] text-gray-500 mt-1.5">{MODES.find(m => m.key === mode)?.hint}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 p-4 shrink-0">
          {step === 'enhance' && !error ? (
            <>
              <button onClick={() => setStep('crop')} disabled={!!busy} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50">Atrás</button>
              <button onClick={() => onDone(file)} disabled={!!busy} className="flex-1 px-3 py-2 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white disabled:opacity-50">Subir original</button>
              <button onClick={save} disabled={!!busy || !result} className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 disabled:opacity-50">Subir mejorado</button>
            </>
          ) : (
            <>
              <button onClick={() => onDone(null)} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">Cancelar</button>
              <button onClick={() => onDone(file)} disabled={!!busy && !error} className="flex-1 px-3 py-2 border border-gray-700 text-gray-400 rounded-lg text-sm hover:text-white disabled:opacity-50">Subir sin mejorar</button>
              {!error && <button onClick={goEnhance} disabled={!!busy || !corners} className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 disabled:opacity-50">Siguiente</button>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ToolButton({ children, ...props }) {
  return <button type="button" {...props} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-50">{children}</button>
}

// The photo with a draggable quad on top. The SVG uses the photo's own pixel
// coordinates (viewBox), so a drag maps straight back to canvas pixels.
function CornerEditor({ url, width, height, corners, onChange }) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const r = Math.max(width, height) / 45 // handle size relative to the photo

  function toPhoto(e) {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: Math.max(0, Math.min(width, p.x)), y: Math.max(0, Math.min(height, p.y)) }
  }
  function down(i, e) {
    e.preventDefault()
    dragRef.current = i
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function move(e) {
    if (dragRef.current == null) return
    const p = toPhoto(e)
    onChange(corners.map((c, i) => (i === dragRef.current ? p : c)))
  }
  const up = () => { dragRef.current = null }
  const pts = corners.map(c => `${c.x},${c.y}`).join(' ')

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="max-w-full max-h-full touch-none select-none"
      style={{ width: '100%', height: '100%' }}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <image href={url} x="0" y="0" width={width} height={height} />
      {/* Outside the sheet dimmed */}
      <path d={`M0 0H${width}V${height}H0Z M${pts.split(' ').join(' L')}Z`} fillRule="evenodd" fill="rgba(0,0,0,0.5)" />
      <polygon points={pts} fill="rgba(234,88,12,0.08)" stroke="#f97316" strokeWidth={r / 4} strokeLinejoin="round" />
      {corners.map((c, i) => (
        <g key={i} onPointerDown={e => down(i, e)} style={{ cursor: 'grab' }}>
          <circle cx={c.x} cy={c.y} r={r * 1.8} fill="transparent" />
          <circle cx={c.x} cy={c.y} r={r} fill="rgba(249,115,22,0.35)" stroke="#fff" strokeWidth={r / 4} />
        </g>
      ))}
    </svg>
  )
}

// Let React paint the "busy" message before the heavy pixel work blocks the thread
const tick = () => new Promise(r => setTimeout(r, 30))
