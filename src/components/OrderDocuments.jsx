import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, friendlyError } from './Toast'

// pdf.js loader (shared with OrderInvoice)
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

async function pdfToImagesProgressive(url, onPage) {
  try {
    const pdfjsLib = await loadPdfJs()
    const pdf = await pdfjsLib.getDocument(url).promise
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const scale = 1.5
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      onPage(canvas.toDataURL('image/png'))
    }
  } catch (err) {
    console.error('PDF render error:', err)
  }
}

const DOC_TYPES = [
  { key: 'RC', label: 'RC', full: 'Rate Confirmation', color: 'text-blue-400 bg-blue-900/40 border-blue-700/50' },
  { key: 'BOL', label: 'BOL', full: 'Bill of Lading', color: 'text-emerald-400 bg-emerald-900/40 border-emerald-700/50' },
  { key: 'POD', label: 'POD', full: 'Proof of Delivery', color: 'text-orange-400 bg-orange-900/40 border-orange-700/50' },
]

export default function OrderDocuments({ orderId }) {
  const toast = useToast()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [activeType, setActiveType] = useState(null) // filter
  const [preview, setPreview] = useState(null) // doc being previewed
  const fileRef = useRef()
  const [uploadType, setUploadType] = useState('RC')
  const [fullscreen, setFullscreen] = useState(null)
  const [viewerImages, setViewerImages] = useState([])
  const [viewerLoading, setViewerLoading] = useState(false)

  useEffect(() => {
    if (orderId) fetchDocs()
  }, [orderId])

  async function fetchDocs() {
    setLoading(true)
    const { data } = await supabase.from('order_documents').select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  function getPublicUrl(filePath) {
    const { data } = supabase.storage.from('order-docs').getPublicUrl(filePath)
    return data?.publicUrl
  }

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `${orderId}/${uploadType}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('order-docs')
        .upload(filePath, file)
      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('order_documents').insert({
        order_id: orderId,
        doc_type: uploadType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
      })
      if (dbError) throw dbError

      toast.success(`${uploadType} subido correctamente`)
      fetchDocs()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(doc) {
    const ok = await toast.confirm(`¿Eliminar ${doc.doc_type}: ${doc.file_name}?`)
    if (!ok) return
    await supabase.storage.from('order-docs').remove([doc.file_path])
    await supabase.from('order_documents').delete().eq('id', doc.id)
    if (preview?.id === doc.id) setPreview(null)
    toast.success('Documento eliminado')
    fetchDocs()
  }

  const filtered = activeType ? docs.filter(d => d.doc_type === activeType) : docs
  const counts = {}
  DOC_TYPES.forEach(t => { counts[t.key] = docs.filter(d => d.doc_type === t.key).length })

  const isImage = (mime) => mime && mime.startsWith('image/')
  const isPdf = (mime) => mime === 'application/pdf'

  async function openViewer(doc) {
    setFullscreen(doc)
    setViewerImages([])
    setViewerLoading(true)
    const url = getPublicUrl(doc.file_path)
    if (isPdf(doc.mime_type)) {
      await pdfToImagesProgressive(url, (img) => {
        setViewerImages(prev => [...prev, img])
        setViewerLoading(false)
      })
      setViewerLoading(false)
    } else if (isImage(doc.mime_type)) {
      setViewerImages([url])
      setViewerLoading(false)
    } else {
      setViewerLoading(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Documentos</h3>
            <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{docs.length}</span>
          </div>
        </div>

        {/* Type filter tabs */}
        <div className="flex gap-1.5">
          {DOC_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveType(activeType === t.key ? null : t.key)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                activeType === t.key || (!activeType && counts[t.key] > 0)
                  ? t.color
                  : 'text-gray-600 bg-gray-800/50 border-gray-700/50'
              }`}
            >
              {t.key}
              {counts[t.key] > 0 && (
                <span className="ml-1 text-[9px] opacity-70">{counts[t.key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Upload bar */}
      <div className="px-4 py-2 border-b border-gray-800 flex gap-1.5 items-center">
        <select
          value={uploadType}
          onChange={(e) => setUploadType(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-blue-500"
        >
          {DOC_TYPES.map(t => (
            <option key={t.key} value={t.key}>{t.key} - {t.full}</option>
          ))}
        </select>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-1 px-2 py-1 bg-blue-600/20 border border-blue-600/50 text-blue-300 rounded text-[11px] font-medium hover:bg-blue-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {uploading ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          )}
          {uploading ? 'Subiendo...' : 'Subir'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files[0])}
        />
      </div>

      {/* Document list */}
      <div className="max-h-[300px] overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-2">
            <div className="h-10 bg-gray-800 rounded animate-pulse" />
            <div className="h-10 bg-gray-800 rounded animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-gray-600 text-xs">
            {docs.length === 0 ? 'Sin documentos' : 'Sin documentos de este tipo'}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {filtered.map(doc => {
              const typeConfig = DOC_TYPES.find(t => t.key === doc.doc_type) || DOC_TYPES[0]
              const isActive = preview?.id === doc.id
              return (
                <div
                  key={doc.id}
                  className={`px-4 py-2 flex items-center gap-2 hover:bg-gray-800/30 transition-colors cursor-pointer ${isActive ? 'bg-gray-800/40' : ''}`}
                  onClick={() => setPreview(isActive ? null : doc)}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    doc.doc_type === 'RC' ? 'bg-blue-400' : doc.doc_type === 'BOL' ? 'bg-emerald-400' : 'bg-orange-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-semibold uppercase ${typeConfig.color.split(' ')[0]}`}>{doc.doc_type}</p>
                    <p className="text-[10px] text-gray-500 truncate">{doc.file_name}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); openViewer(doc) }}
                      className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
                      title="Ver en grande"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                      </svg>
                    </button>
                    <a
                      href={getPublicUrl(doc.file_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
                      title="Abrir en nueva pestaña"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc) }}
                      className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="border-t border-gray-800">
          <div className="px-4 py-2 flex items-center justify-between bg-gray-800/30">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="text-[11px] text-gray-400 font-medium">{preview.doc_type}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => openViewer(preview)} className="p-1 text-gray-500 hover:text-blue-400 transition-colors" title="Ver en grande">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              </button>
              <button onClick={() => setPreview(null)} className="p-1 text-gray-600 hover:text-white transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-2 bg-gray-950">
            {isImage(preview.mime_type) ? (
              <img
                src={getPublicUrl(preview.file_path)}
                alt={preview.file_name}
                className="w-full rounded border border-gray-800"
              />
            ) : isPdf(preview.mime_type) ? (
              <iframe
                src={getPublicUrl(preview.file_path)}
                className="w-full h-[400px] rounded border border-gray-800"
                title={preview.file_name}
              />
            ) : (
              <div className="py-8 text-center text-gray-600 text-xs">
                Vista previa no disponible.{' '}
                <a href={getPublicUrl(preview.file_path)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  Descargar
                </a>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Document viewer (invoice-style modal with pdf.js rendering) */}
      {fullscreen && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-2 sm:p-4 overflow-auto">
          <div style={{ backgroundColor: '#ffffff' }} className="rounded-xl w-full max-w-3xl max-h-[95vh] overflow-auto shadow-2xl">
            {/* Toolbar */}
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between rounded-t-xl z-10">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                  DOC_TYPES.find(t => t.key === fullscreen.doc_type)?.color || ''
                }`}>{fullscreen.doc_type}</span>
                <span className="text-sm text-gray-300 font-medium truncate max-w-[200px] sm:max-w-none">{fullscreen.file_name}</span>
              </div>
              <div className="flex gap-2">
                <a
                  href={getPublicUrl(fullscreen.file_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Abrir
                </a>
                <button onClick={() => setFullscreen(null)} className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
            {/* Content — rendered as images via pdf.js */}
            <div style={{ padding: '20px', minHeight: '400px' }}>
              {viewerLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: '12px' }}>
                  <svg className="w-6 h-6 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span style={{ color: '#9ca3af', fontSize: '13px' }}>Cargando documento...</span>
                </div>
              ) : viewerImages.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {viewerImages.map((src, i) => (
                    <img key={i} src={src} alt={`${fullscreen.doc_type} pag ${i + 1}`} style={{ width: '100%', borderRadius: '4px', border: '1px solid #e5e7eb' }} />
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
                  <p style={{ marginBottom: '8px' }}>Vista previa no disponible</p>
                  <a href={getPublicUrl(fullscreen.file_path)} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                    Descargar archivo
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
