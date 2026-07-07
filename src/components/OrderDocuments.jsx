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

export default function OrderDocuments({ orderId, onDocsChange }) {
  const toast = useToast()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null) // which type is uploading
  const rcFileRef = useRef()
  const bolFileRef = useRef()
  const podFileRef = useRef()
  const fileRefs = { RC: rcFileRef, BOL: bolFileRef, POD: podFileRef }
  const [fullscreen, setFullscreen] = useState(null)
  const [viewerImages, setViewerImages] = useState([])
  const [viewerLoading, setViewerLoading] = useState(false)
  const [draggingType, setDraggingType] = useState(null)
  const dragCounters = useRef({ RC: 0, BOL: 0, POD: 0 })

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

  async function handleUpload(file, docType) {
    if (!file) return
    setUploading(docType)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `${orderId}/${docType}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('order-docs')
        .upload(filePath, file)
      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('order_documents').insert({
        order_id: orderId,
        doc_type: docType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
      })
      if (dbError) throw dbError

      toast.success(`${docType} subido correctamente`)
      fetchDocs()
      onDocsChange?.()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setUploading(null)
      const ref = fileRefs[docType]
      if (ref?.current) ref.current.value = ''
    }
  }

  async function handleDelete(doc) {
    const ok = await toast.confirm(`¿Eliminar ${doc.doc_type}: ${doc.file_name}?`)
    if (!ok) return
    await supabase.storage.from('order-docs').remove([doc.file_path])
    await supabase.from('order_documents').delete().eq('id', doc.id)
    toast.success('Documento eliminado')
    fetchDocs()
    onDocsChange?.()
  }

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

  function DocSection({ type }) {
    const typeDocs = docs.filter(d => d.doc_type === type.key)
    const ref = fileRefs[type.key]
    const isUploading = uploading === type.key
    const isDragging = draggingType === type.key

    return (
      <div
        className={`border-b border-gray-800 last:border-b-0 transition-colors ${isDragging ? 'bg-gray-800/30' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounters.current[type.key]++; setDraggingType(type.key) }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounters.current[type.key]--; if (dragCounters.current[type.key] === 0) setDraggingType(null) }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounters.current[type.key] = 0; setDraggingType(null); const f = e.dataTransfer.files[0]; if (f) handleUpload(f, type.key) }}
      >
        {/* Section header with upload button */}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              type.key === 'RC' ? 'bg-blue-400' : type.key === 'BOL' ? 'bg-emerald-400' : 'bg-orange-400'
            }`} />
            <span className={`text-xs font-semibold ${type.color.split(' ')[0]}`}>{type.full}</span>
            {typeDocs.length > 0 && (
              <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{typeDocs.length}</span>
            )}
          </div>
          <button
            onClick={() => ref.current?.click()}
            disabled={isUploading}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors border ${
              isDragging
                ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                : `${type.color} hover:opacity-80`
            }`}
          >
            {isUploading ? (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
            )}
            {isUploading ? 'Subiendo...' : isDragging ? 'Soltar aqui' : `Subir ${type.key}`}
          </button>
          <input
            ref={ref}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => { handleUpload(e.target.files[0], type.key) }}
          />
        </div>

        {/* Documents for this type */}
        {typeDocs.length > 0 && (
          <div className="px-4 pb-2.5 space-y-1">
            {typeDocs.map(doc => {
              return (
                <div
                  key={doc.id}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-gray-800/40 transition-colors cursor-pointer bg-gray-800/20`}
                  onClick={() => openViewer(doc)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-400 truncate">{doc.file_name}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Documentos</h3>
          <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{docs.length}</span>
        </div>
      </div>

      {/* Sections per doc type */}
      {loading ? (
        <div className="p-4 space-y-2">
          <div className="h-10 bg-gray-800 rounded animate-pulse" />
          <div className="h-10 bg-gray-800 rounded animate-pulse" />
          <div className="h-10 bg-gray-800 rounded animate-pulse" />
        </div>
      ) : (
        DOC_TYPES.map(t => <DocSection key={t.key} type={t} />)
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
