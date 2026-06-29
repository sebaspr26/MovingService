import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, friendlyError } from './Toast'

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
            <button onClick={() => setPreview(null)} className="text-gray-600 hover:text-white transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
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
    </div>
  )
}
