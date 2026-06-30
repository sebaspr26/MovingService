import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, friendlyError } from './Toast'

const SECTIONS = [
  { key: 'company_info', label: 'Company Information', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m16.5-18v18M5.25 6h.008v.008H5.25V6Zm0 3h.008v.008H5.25V9Zm0 3h.008v.008H5.25V12Zm7.5-6h.008v.008h-.008V6Zm0 3h.008v.008h-.008V9Zm0 3h.008v.008h-.008V12Z" /> },
  { key: 'billing', label: 'Billing Information', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /> },
  { key: 'company_docs', label: 'Company Documents', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /> },
  { key: 'choferes', label: 'Choferes', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /> },
  { key: 'camiones', label: 'Camiones', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /> },
  { key: 'trailers', label: 'Trailers', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5m-10.5 3h10.5M3.75 18h16.5M3.75 12h16.5m-16.5 3h16.5" /> },
]

export default function CompanyInfo() {
  const [activeSection, setActiveSection] = useState('company_info')

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Informaci&oacute;n de la Compa&ntilde;&iacute;a</h1>
        <p className="text-sm text-gray-500 mt-1">Choferes, camiones y trailers</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-56 shrink-0 flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeSection === s.key
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              <svg className="w-4.5 h-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {s.icon}
              </svg>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {activeSection === 'company_info' && <SectionCompanyInfo />}
          {activeSection === 'billing' && <SectionBilling />}
          {activeSection === 'company_docs' && <SectionCompanyDocs />}
          {activeSection === 'choferes' && <SectionChoferes />}
          {activeSection === 'camiones' && <SectionCamiones />}
          {activeSection === 'trailers' && <SectionTrailers />}
        </div>
      </div>
    </div>
  )
}

/* ============================
   SECTION: COMPANY INFORMATION
   ============================ */

function SectionCompanyInfo() {
  const [form, setForm] = useState({
    company_name: '',
    dba: '',
    ein: '',
    mc_number: '',
    dot_number: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
    website: '',
    founded: '',
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Company Information</h2>
        <p className="text-[10px] text-gray-600">Esta info se muestra en el Bill/Invoice</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Company Name</label>
            <input value={form.company_name} onChange={e => update('company_name', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="ETG Moving Services" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">DBA (Doing Business As)</label>
            <input value={form.dba} onChange={e => update('dba', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="Driving Is Work LLC" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">EIN (Tax ID)</label>
            <input value={form.ein} onChange={e => update('ein', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="XX-XXXXXXX" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">MC Number</label>
            <input value={form.mc_number} onChange={e => update('mc_number', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="MC-XXXXXXX" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">DOT Number</label>
            <input value={form.dot_number} onChange={e => update('dot_number', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="XXXXXXX" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Date Founded</label>
            <input type="date" value={form.founded} onChange={e => update('founded', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <hr className="border-gray-800" />
        <h3 className="text-sm font-medium text-gray-400">Address</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Street Address</label>
            <input value={form.address} onChange={e => update('address', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="123 Main St" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">City</label>
            <input value={form.city} onChange={e => update('city', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="Houston" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">State</label>
              <input value={form.state} onChange={e => update('state', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="TX" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ZIP</label>
              <input value={form.zip} onChange={e => update('zip', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="77001" />
            </div>
          </div>
        </div>

        <hr className="border-gray-800" />
        <h3 className="text-sm font-medium text-gray-400">Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Phone</label>
            <input value={form.phone} onChange={e => update('phone', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="info@company.com" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Website</label>
            <input value={form.website} onChange={e => update('website', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" placeholder="www.company.com" />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================
   SECTION: BILLING INFORMATION
   ============================ */

function SectionBilling() {
  const [billing, setBilling] = useState({
    billing_name: '',
    billing_address: '',
    billing_city: '',
    billing_state: '',
    billing_zip: '',
    billing_phone: '',
    billing_email: '',
  })
  const [remit, setRemit] = useState({
    remit_name: '',
    remit_address: '',
    remit_city: '',
    remit_state: '',
    remit_zip: '',
  })

  const updateB = (field, value) => setBilling(prev => ({ ...prev, [field]: value }))
  const updateR = (field, value) => setRemit(prev => ({ ...prev, [field]: value }))

  const inputClass = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Billing Information</h2>

      {/* Billing Form */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-400">Bill To</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Company / Name</label>
            <input value={billing.billing_name} onChange={e => updateB('billing_name', e.target.value)} className={inputClass} placeholder="Company name" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Address</label>
            <input value={billing.billing_address} onChange={e => updateB('billing_address', e.target.value)} className={inputClass} placeholder="Street address" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">City</label>
            <input value={billing.billing_city} onChange={e => updateB('billing_city', e.target.value)} className={inputClass} placeholder="City" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">State</label>
              <input value={billing.billing_state} onChange={e => updateB('billing_state', e.target.value)} className={inputClass} placeholder="TX" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ZIP</label>
              <input value={billing.billing_zip} onChange={e => updateB('billing_zip', e.target.value)} className={inputClass} placeholder="77001" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Phone</label>
            <input value={billing.billing_phone} onChange={e => updateB('billing_phone', e.target.value)} className={inputClass} placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input type="email" value={billing.billing_email} onChange={e => updateB('billing_email', e.target.value)} className={inputClass} placeholder="billing@company.com" />
          </div>
        </div>
      </div>

      {/* Remit To */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-400">Remit To</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Company / Name</label>
            <input value={remit.remit_name} onChange={e => updateR('remit_name', e.target.value)} className={inputClass} placeholder="Company name" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Address</label>
            <input value={remit.remit_address} onChange={e => updateR('remit_address', e.target.value)} className={inputClass} placeholder="Street address" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">City</label>
            <input value={remit.remit_city} onChange={e => updateR('remit_city', e.target.value)} className={inputClass} placeholder="City" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">State</label>
              <input value={remit.remit_state} onChange={e => updateR('remit_state', e.target.value)} className={inputClass} placeholder="TX" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ZIP</label>
              <input value={remit.remit_zip} onChange={e => updateR('remit_zip', e.target.value)} className={inputClass} placeholder="77001" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
          Guardar
        </button>
      </div>
    </div>
  )
}

/* ============================
   SECTION: COMPANY DOCUMENTS
   ============================ */

function SectionCompanyDocs() {
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()
  const [preview, setPreview] = useState(null)
  const [docName, setDocName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)

  function handleFileSelect(file) {
    if (!file) return
    setPendingFile(file)
    setDocName(file.name.replace(/\.[^/.]+$/, ''))
    setShowNameInput(true)
  }

  function confirmUpload() {
    if (!pendingFile || !docName.trim()) return
    const newDoc = {
      id: Date.now(),
      name: docName.trim(),
      file_name: pendingFile.name,
      mime_type: pendingFile.type,
      size: pendingFile.size,
      url: URL.createObjectURL(pendingFile),
      uploaded_at: new Date().toISOString(),
    }
    setDocs(prev => [newDoc, ...prev])
    setPendingFile(null)
    setDocName('')
    setShowNameInput(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeDoc(id) {
    setDocs(prev => prev.filter(d => d.id !== id))
    if (preview?.id === id) setPreview(null)
  }

  const isImage = (mime) => mime && mime.startsWith('image/')
  const isPdf = (mime) => mime === 'application/pdf'
  const formatSize = (bytes) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Company Documents</h2>
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{docs.length}</span>
        </div>
      </div>

      {/* Upload area */}
      {showNameInput ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
          <p className="text-xs text-gray-500">Archivo: <span className="text-gray-300">{pendingFile?.name}</span></p>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nombre del documento</label>
            <input
              value={docName}
              onChange={e => setDocName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmUpload(); if (e.key === 'Escape') { setShowNameInput(false); setPendingFile(null) } }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowNameInput(false); setPendingFile(null) }} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button onClick={confirmUpload} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">Subir</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full py-8 border-2 border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors flex flex-col items-center gap-2"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-sm">Click para subir documento</span>
          <span className="text-[10px] text-gray-600">PDF, imagenes u otros archivos</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={e => handleFileSelect(e.target.files[0])}
      />

      {/* Documents list */}
      {docs.length === 0 ? (
        <div className="text-center py-8 bg-gray-900 rounded-xl border border-gray-800">
          <svg className="w-10 h-10 mx-auto text-gray-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-sm text-gray-500">No hay documentos subidos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-900/30 text-blue-400 flex items-center justify-center shrink-0">
                  {isImage(doc.mime_type) ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 0 3Z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{doc.name}</p>
                  <p className="text-[10px] text-gray-500">{doc.file_name} - {formatSize(doc.size)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(isImage(doc.mime_type) || isPdf(doc.mime_type)) && (
                    <button
                      onClick={() => setPreview(preview?.id === doc.id ? null : doc)}
                      className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded hover:bg-gray-800"
                      title="Ver"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    </button>
                  )}
                  <a
                    href={doc.url}
                    download={doc.file_name}
                    className="p-1.5 text-gray-500 hover:text-green-400 transition-colors rounded hover:bg-gray-800"
                    title="Descargar"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </a>
                  <button
                    onClick={() => removeDoc(doc.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded hover:bg-gray-800"
                    title="Eliminar"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>

              {preview?.id === doc.id && (
                <div className="border-t border-gray-800 p-3 bg-gray-950/50">
                  {isImage(doc.mime_type) ? (
                    <img src={doc.url} alt={doc.name} className="max-h-80 mx-auto rounded border border-gray-700" />
                  ) : isPdf(doc.mime_type) ? (
                    <iframe src={doc.url} className="w-full h-[500px] rounded border border-gray-700" title={doc.name} />
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================
   DOCUMENT SLOTS — reusable
   ============================ */

function DocumentSlots({ entityType, entityId, table, bucket, docTypes, docs, onRefresh }) {
  const toast = useToast()
  const fileRef = useRef()
  const [uploading, setUploading] = useState(null) // doc_type being uploaded
  const [preview, setPreview] = useState(null)
  const [addingCustom, setAddingCustom] = useState(false)
  const [customLabel, setCustomLabel] = useState('')

  function getPublicUrl(filePath) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
    return data?.publicUrl
  }

  async function handleUpload(file, docType, label) {
    if (!file) return
    setUploading(docType)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `${entityType}/${entityId}/${docType}_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file)
      if (uploadError) throw uploadError

      const insertData = {
        [`${entityType}_id`]: entityId,
        doc_type: docType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
      }
      if (label) insertData.label = label
      const { error: dbError } = await supabase.from(table).insert(insertData)
      if (dbError) throw dbError

      toast.success('Documento subido')
      onRefresh()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setUploading(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(doc) {
    const ok = await toast.confirm(`¿Eliminar ${doc.label || doc.doc_type}: ${doc.file_name}?`)
    if (!ok) return
    await supabase.storage.from(bucket).remove([doc.file_path])
    await supabase.from(table).delete().eq('id', doc.id)
    if (preview?.id === doc.id) setPreview(null)
    toast.success('Documento eliminado')
    onRefresh()
  }

  function triggerUpload(docType, label) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,application/pdf'
    input.onchange = (e) => handleUpload(e.target.files[0], docType, label)
    input.click()
  }

  const isImage = (mime) => mime && mime.startsWith('image/')
  const isPdf = (mime) => mime === 'application/pdf'

  // Group docs by doc_type
  const docsByType = {}
  docs.forEach(d => {
    const key = d.doc_type === 'other' ? `other_${d.id}` : d.doc_type
    if (!docsByType[key]) docsByType[key] = []
    docsByType[key].push(d)
  })

  const otherDocs = docs.filter(d => d.doc_type === 'other')

  return (
    <div className="space-y-3">
      {/* Fixed doc type slots */}
      {docTypes.map(dt => {
        const slotDocs = docs.filter(d => d.doc_type === dt.key)
        const hasDoc = slotDocs.length > 0
        return (
          <div key={dt.key} className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasDoc ? 'bg-green-900/40 text-green-400' : 'bg-gray-700/50 text-gray-500'}`}>
                  {hasDoc ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">{dt.label}</p>
                  {hasDoc && <p className="text-[10px] text-gray-500">{slotDocs[0].file_name}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {hasDoc && (
                  <>
                    <button
                      onClick={() => setPreview(preview?.id === slotDocs[0].id ? null : slotDocs[0])}
                      className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded hover:bg-gray-700/50"
                      title="Ver"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    </button>
                    <a
                      href={getPublicUrl(slotDocs[0].file_path)}
                      download={slotDocs[0].file_name}
                      className="p-1.5 text-gray-500 hover:text-green-400 transition-colors rounded hover:bg-gray-700/50"
                      title="Descargar"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </a>
                    <button
                      onClick={() => handleDelete(slotDocs[0])}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded hover:bg-gray-700/50"
                      title="Eliminar"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  onClick={() => triggerUpload(dt.key)}
                  disabled={uploading === dt.key}
                  className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded hover:bg-gray-700/50 disabled:opacity-50"
                  title={hasDoc ? 'Reemplazar' : 'Subir'}
                >
                  {uploading === dt.key ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Preview inline */}
            {preview && slotDocs.some(d => d.id === preview.id) && (
              <div className="border-t border-gray-700/50 p-3 bg-gray-900/50">
                {isImage(preview.mime_type) ? (
                  <img src={getPublicUrl(preview.file_path)} alt={preview.file_name} className="max-h-64 mx-auto rounded border border-gray-700" />
                ) : isPdf(preview.mime_type) ? (
                  <iframe src={getPublicUrl(preview.file_path)} className="w-full h-[400px] rounded border border-gray-700" title={preview.file_name} />
                ) : (
                  <p className="text-center text-gray-500 text-sm py-4">Vista previa no disponible. <a href={getPublicUrl(preview.file_path)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Descargar</a></p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Other/custom docs */}
      {otherDocs.map(doc => (
        <div key={doc.id} className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-900/40 text-purple-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">{doc.label || 'Otro'}</p>
                <p className="text-[10px] text-gray-500">{doc.file_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPreview(preview?.id === doc.id ? null : doc)} className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded hover:bg-gray-700/50" title="Ver">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </button>
              <a href={getPublicUrl(doc.file_path)} download={doc.file_name} className="p-1.5 text-gray-500 hover:text-green-400 transition-colors rounded hover:bg-gray-700/50" title="Descargar">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </a>
              <button onClick={() => handleDelete(doc)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded hover:bg-gray-700/50" title="Eliminar">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
          {preview?.id === doc.id && (
            <div className="border-t border-gray-700/50 p-3 bg-gray-900/50">
              {isImage(preview.mime_type) ? (
                <img src={getPublicUrl(preview.file_path)} alt={preview.file_name} className="max-h-64 mx-auto rounded border border-gray-700" />
              ) : isPdf(preview.mime_type) ? (
                <iframe src={getPublicUrl(preview.file_path)} className="w-full h-[400px] rounded border border-gray-700" title={preview.file_name} />
              ) : (
                <p className="text-center text-gray-500 text-sm py-4">Vista previa no disponible.</p>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add custom doc */}
      {addingCustom ? (
        <div className="flex gap-2 items-center">
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Nombre del documento..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customLabel.trim()) {
                triggerUpload('other', customLabel.trim())
                setAddingCustom(false)
                setCustomLabel('')
              }
              if (e.key === 'Escape') { setAddingCustom(false); setCustomLabel('') }
            }}
          />
          <button
            onClick={() => {
              if (customLabel.trim()) {
                triggerUpload('other', customLabel.trim())
                setAddingCustom(false)
                setCustomLabel('')
              }
            }}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
          >
            Subir
          </button>
          <button
            onClick={() => { setAddingCustom(false); setCustomLabel('') }}
            className="px-3 py-2 text-gray-500 text-sm hover:text-gray-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingCustom(true)}
          className="w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Agregar otro documento
        </button>
      )}
    </div>
  )
}

/* ============================
   SECTION: CHOFERES
   ============================ */

const DRIVER_DOC_TYPES = [
  { key: 'license', label: 'Licencia de Conduccion' },
  { key: 'medical_card', label: 'Tarjeta Medica' },
]

function SectionChoferes() {
  const toast = useToast()
  const [drivers, setDrivers] = useState([])
  const [trucks, setTrucks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [docs, setDocs] = useState({})

  const [form, setForm] = useState({ name: '', phone: '', email: '', license_number: '', license_state: '', license_expiry: '', medical_card_expiry: '', truck_id: '', status: 'active' })

  useEffect(() => { fetchDrivers(); fetchTrucks() }, [])

  async function fetchDrivers() {
    setLoading(true)
    const { data } = await supabase.from('drivers').select('*').order('name')
    setDrivers(data || [])
    setLoading(false)
  }

  async function fetchTrucks() {
    const { data } = await supabase.from('trucks').select('id, name, number').order('number')
    setTrucks(data || [])
  }

  async function fetchDocs(driverId) {
    const { data } = await supabase.from('driver_documents').select('*').eq('driver_id', driverId).order('created_at')
    setDocs(prev => ({ ...prev, [driverId]: data || [] }))
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', phone: '', email: '', license_number: '', license_state: '', license_expiry: '', medical_card_expiry: '', truck_id: '', status: 'active' })
    setShowForm(true)
  }

  function openEdit(driver) {
    setEditing(driver)
    setForm({
      name: driver.name || '',
      phone: driver.phone || '',
      email: driver.email || '',
      license_number: driver.license_number || '',
      license_state: driver.license_state || '',
      license_expiry: driver.license_expiry || '',
      medical_card_expiry: driver.medical_card_expiry || '',
      truck_id: driver.truck_id || '',
      status: driver.status || 'active',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.warning('El nombre es requerido'); return }
    try {
      const payload = { ...form, truck_id: form.truck_id || null }
      if (editing) {
        const { error } = await supabase.from('drivers').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Chofer actualizado')
      } else {
        const { error } = await supabase.from('drivers').insert(payload)
        if (error) throw error
        toast.success('Chofer creado')
      }
      setShowForm(false)
      fetchDrivers()
    } catch (err) {
      toast.error(friendlyError(err.message))
    }
  }

  async function handleDelete(driver) {
    const ok = await toast.confirm(`¿Eliminar chofer "${driver.name}"?`)
    if (!ok) return
    const { error } = await supabase.from('drivers').delete().eq('id', driver.id)
    if (error) { toast.error(friendlyError(error.message)); return }
    toast.success('Chofer eliminado')
    if (expanded === driver.id) setExpanded(null)
    fetchDrivers()
  }

  function toggleExpand(driverId) {
    if (expanded === driverId) {
      setExpanded(null)
    } else {
      setExpanded(driverId)
      if (!docs[driverId]) fetchDocs(driverId)
    }
  }

  const getTruckName = (truckId) => {
    const t = trucks.find(t => t.id === truckId)
    return t ? `${t.name} (#${t.number})` : null
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Choferes</h2>
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{drivers.length}</span>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nuevo Chofer
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="bg-gray-800/80 rounded-xl border border-gray-700 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">{editing ? 'Editar Chofer' : 'Nuevo Chofer'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nombre *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Telefono</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} type="email" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Camion Asignado</label>
              <select value={form.truck_id} onChange={e => setForm({...form, truck_id: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                <option value="">Sin asignar</option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.name} (#{t.number})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Licencia #</label>
              <input value={form.license_number} onChange={e => setForm({...form, license_number: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Estado Licencia</label>
              <input value={form.license_state} onChange={e => setForm({...form, license_state: e.target.value})} placeholder="TX, CA..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Vencimiento Licencia</label>
              <input value={form.license_expiry} onChange={e => setForm({...form, license_expiry: e.target.value})} type="date" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Vencimiento Tarjeta Medica</label>
              <input value={form.medical_card_expiry} onChange={e => setForm({...form, medical_card_expiry: e.target.value})} type="date" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <label className="text-xs text-gray-500">Estado:</label>
            <button
              onClick={() => setForm({...form, status: form.status === 'active' ? 'inactive' : 'active'})}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${form.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}
            >
              {form.status === 'active' ? 'Activo' : 'Inactivo'}
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
              {editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {/* Drivers list */}
      {drivers.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <svg className="w-12 h-12 mx-auto text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          <p className="text-sm text-gray-500">No hay choferes registrados</p>
          <button onClick={openCreate} className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors">Agregar el primero</button>
        </div>
      ) : (
        <div className="space-y-2">
          {drivers.map(driver => {
            const isExpanded = expanded === driver.id
            const truckName = getTruckName(driver.truck_id)
            const licenseExpired = driver.license_expiry && new Date(driver.license_expiry) < new Date()
            const medicalExpired = driver.medical_card_expiry && new Date(driver.medical_card_expiry) < new Date()

            return (
              <div key={driver.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                {/* Driver card header */}
                <div
                  className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => toggleExpand(driver.id)}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${driver.status === 'active' ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-700 text-gray-500'}`}>
                    {driver.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{driver.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${driver.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                        {driver.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                      {licenseExpired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 font-medium">Licencia vencida</span>}
                      {medicalExpired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 font-medium">Med. vencida</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {truckName && <p className="text-[11px] text-gray-500">{truckName}</p>}
                      {driver.license_number && <p className="text-[11px] text-gray-500">CDL: {driver.license_number}</p>}
                      {driver.phone && <p className="text-[11px] text-gray-500">{driver.phone}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(driver) }}
                      className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded hover:bg-gray-800"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(driver) }}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded hover:bg-gray-800"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                    <svg className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>

                {/* Expanded: documents */}
                {isExpanded && (
                  <div className="px-4 py-4 border-t border-gray-800 bg-gray-950/50">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Documentos</h4>
                    <DocumentSlots
                      entityType="driver"
                      entityId={driver.id}
                      table="driver_documents"
                      bucket="company-docs"
                      docTypes={DRIVER_DOC_TYPES}
                      docs={docs[driver.id] || []}
                      onRefresh={() => fetchDocs(driver.id)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ============================
   SECTION: CAMIONES
   ============================ */

const TRUCK_DOC_TYPES = [
  { key: 'license_plate', label: 'License Plate' },
  { key: 'cab_card', label: 'Cab Card' },
  { key: 'truck_picture', label: 'Truck Picture' },
  { key: 'vin_picture', label: 'VIN Picture' },
]

function SectionCamiones() {
  const toast = useToast()
  const [trucks, setTrucks] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [docs, setDocs] = useState({})

  useEffect(() => { fetchTrucks() }, [])

  async function fetchTrucks() {
    setLoading(true)
    const { data } = await supabase.from('trucks').select('*').order('number')
    setTrucks(data || [])
    setLoading(false)
  }

  async function fetchDocs(truckId) {
    const { data } = await supabase.from('truck_documents').select('*').eq('truck_id', truckId).order('created_at')
    setDocs(prev => ({ ...prev, [truckId]: data || [] }))
  }

  function toggleExpand(truckId) {
    if (expanded === truckId) {
      setExpanded(null)
    } else {
      setExpanded(truckId)
      if (!docs[truckId]) fetchDocs(truckId)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-white">Camiones</h2>
        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{trucks.length}</span>
        <p className="text-xs text-gray-600 ml-auto">Los camiones se crean desde el Dashboard</p>
      </div>

      {trucks.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <svg className="w-12 h-12 mx-auto text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
          <p className="text-sm text-gray-500">No hay camiones registrados</p>
          <p className="text-xs text-gray-600 mt-1">Crea camiones desde el Dashboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trucks.map(truck => {
            const isExpanded = expanded === truck.id
            const truckDocs = docs[truck.id] || []
            const docCount = truckDocs.length

            return (
              <div key={truck.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => toggleExpand(truck.id)}
                >
                  <div className="w-10 h-10 rounded-lg bg-orange-900/30 text-orange-400 flex items-center justify-center font-bold text-sm">
                    #{truck.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{truck.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-[11px] text-gray-500">Truck #{truck.number}</p>
                      {truck.discount_percent && <p className="text-[11px] text-gray-500">Descuento: {truck.discount_percent}%</p>}
                      {docCount > 0 && <p className="text-[11px] text-green-500">{docCount} doc{docCount > 1 ? 's' : ''}</p>}
                    </div>
                  </div>
                  <svg className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="px-4 py-4 border-t border-gray-800 bg-gray-950/50">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Documentos & Fotos</h4>
                    <DocumentSlots
                      entityType="truck"
                      entityId={truck.id}
                      table="truck_documents"
                      bucket="company-docs"
                      docTypes={TRUCK_DOC_TYPES}
                      docs={truckDocs}
                      onRefresh={() => fetchDocs(truck.id)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ============================
   SECTION: TRAILERS
   ============================ */

const TRAILER_TYPES = ['Dry Van', 'Flatbed', 'Reefer', 'Step Deck', 'Lowboy', 'Tanker', 'Otro']

function SectionTrailers() {
  const toast = useToast()
  const [trailers, setTrailers] = useState([])
  const [trucks, setTrucks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [docs, setDocs] = useState({})

  const [form, setForm] = useState({ name: '', number: '', type: '', truck_id: '', status: 'active' })

  useEffect(() => { fetchTrailers(); fetchTrucks() }, [])

  async function fetchTrailers() {
    setLoading(true)
    const { data } = await supabase.from('trailers').select('*').order('name')
    setTrailers(data || [])
    setLoading(false)
  }

  async function fetchTrucks() {
    const { data } = await supabase.from('trucks').select('id, name, number').order('number')
    setTrucks(data || [])
  }

  async function fetchDocs(trailerId) {
    const { data } = await supabase.from('trailer_documents').select('*').eq('trailer_id', trailerId).order('created_at')
    setDocs(prev => ({ ...prev, [trailerId]: data || [] }))
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', number: '', type: '', truck_id: '', status: 'active' })
    setShowForm(true)
  }

  function openEdit(trailer) {
    setEditing(trailer)
    setForm({
      name: trailer.name || '',
      number: trailer.number || '',
      type: trailer.type || '',
      truck_id: trailer.truck_id || '',
      status: trailer.status || 'active',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.warning('El nombre es requerido'); return }
    try {
      const payload = { ...form, truck_id: form.truck_id || null }
      if (editing) {
        const { error } = await supabase.from('trailers').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Trailer actualizado')
      } else {
        const { error } = await supabase.from('trailers').insert(payload)
        if (error) throw error
        toast.success('Trailer creado')
      }
      setShowForm(false)
      fetchTrailers()
    } catch (err) {
      toast.error(friendlyError(err.message))
    }
  }

  async function handleDelete(trailer) {
    const ok = await toast.confirm(`¿Eliminar trailer "${trailer.name}"?`)
    if (!ok) return
    const { error } = await supabase.from('trailers').delete().eq('id', trailer.id)
    if (error) { toast.error(friendlyError(error.message)); return }
    toast.success('Trailer eliminado')
    if (expanded === trailer.id) setExpanded(null)
    fetchTrailers()
  }

  function toggleExpand(trailerId) {
    if (expanded === trailerId) {
      setExpanded(null)
    } else {
      setExpanded(trailerId)
      if (!docs[trailerId]) fetchDocs(trailerId)
    }
  }

  const getTruckName = (truckId) => {
    const t = trucks.find(t => t.id === truckId)
    return t ? `${t.name} (#${t.number})` : null
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Trailers</h2>
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{trailers.length}</span>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nuevo Trailer
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800/80 rounded-xl border border-gray-700 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">{editing ? 'Editar Trailer' : 'Nuevo Trailer'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nombre *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Numero</label>
              <input value={form.number} onChange={e => setForm({...form, number: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                <option value="">Seleccionar...</option>
                {TRAILER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Camion Asignado</label>
              <select value={form.truck_id} onChange={e => setForm({...form, truck_id: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                <option value="">Sin asignar</option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.name} (#{t.number})</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <label className="text-xs text-gray-500">Estado:</label>
            <button
              onClick={() => setForm({...form, status: form.status === 'active' ? 'inactive' : 'active'})}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${form.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}
            >
              {form.status === 'active' ? 'Activo' : 'Inactivo'}
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
              {editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {trailers.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <svg className="w-12 h-12 mx-auto text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5m-10.5 3h10.5M3.75 18h16.5M3.75 12h16.5m-16.5 3h16.5" />
          </svg>
          <p className="text-sm text-gray-500">No hay trailers registrados</p>
          <button onClick={openCreate} className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors">Agregar el primero</button>
        </div>
      ) : (
        <div className="space-y-2">
          {trailers.map(trailer => {
            const isExpanded = expanded === trailer.id
            const truckName = getTruckName(trailer.truck_id)
            const trailerDocs = docs[trailer.id] || []

            return (
              <div key={trailer.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => toggleExpand(trailer.id)}
                >
                  <div className="w-10 h-10 rounded-lg bg-cyan-900/30 text-cyan-400 flex items-center justify-center font-bold text-sm">
                    {trailer.number ? `#${trailer.number}` : 'T'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{trailer.name}</p>
                      {trailer.type && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">{trailer.type}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${trailer.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                        {trailer.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {truckName && <p className="text-[11px] text-gray-500">{truckName}</p>}
                      {trailer.number && <p className="text-[11px] text-gray-500">#{trailer.number}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(trailer) }}
                      className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded hover:bg-gray-800"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(trailer) }}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded hover:bg-gray-800"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                    <svg className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 py-4 border-t border-gray-800 bg-gray-950/50">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Documentos</h4>
                    <DocumentSlots
                      entityType="trailer"
                      entityId={trailer.id}
                      table="trailer_documents"
                      bucket="company-docs"
                      docTypes={[]}
                      docs={trailerDocs}
                      onRefresh={() => fetchDocs(trailer.id)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
