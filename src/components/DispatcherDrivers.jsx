import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { isSuperAdmin, getAllowedTruckIds } from '../lib/permissions'
import { getActiveCompanyId } from '../lib/company'
import PdfViewer from './PdfViewer'

function docUrl(filePath) {
  return supabase.storage.from('company-docs').getPublicUrl(filePath).data?.publicUrl
}

function isImage(mime) { return mime?.startsWith('image/') }
function isPdf(mime) { return mime === 'application/pdf' }

function DocPreview({ doc, onClose }) {
  const url = docUrl(doc.file_path)
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 pointer-events-none">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden max-w-2xl w-full pointer-events-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-medium text-white truncate">{doc.label || doc.file_name}</span>
            <div className="flex items-center gap-2">
              <a href={url} download={doc.file_name}
                className="p-1.5 text-gray-400 hover:text-green-400 transition-colors rounded hover:bg-gray-800"
                title="Descargar">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </a>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white transition-colors rounded hover:bg-gray-800">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-3 bg-black/30 max-h-[70vh] overflow-auto flex items-center justify-center">
            {isImage(doc.mime_type)
              ? <img src={url} alt={doc.file_name} className="max-h-[65vh] max-w-full rounded object-contain" />
              : isPdf(doc.mime_type)
                ? <PdfViewer url={url} className="w-full h-[60vh] rounded" />
                : <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm">Abrir archivo</a>
            }
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

function expiryBadge(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const now = new Date()
  const daysLeft = Math.floor((date - now) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0)
    return { bg: 'bg-red-900/40 text-red-400 border-red-800/50', label: 'Vencido' }
  if (daysLeft < 60)
    return { bg: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50', label: `${daysLeft}d` }
  return { bg: 'bg-green-900/30 text-green-400 border-green-800/40', label: `${daysLeft}d` }
}

function fmt_date(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

export default function DispatcherDrivers() {
  const { session } = useAuth()
  const [drivers, setDrivers] = useState([])
  const [trucks, setTrucks] = useState({})
  const [driverDocs, setDriverDocs] = useState({})
  const [truckDocs, setTruckDocs] = useState({})
  const [loading, setLoading] = useState(true)
  const [copiedKey, setCopiedKey] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)

  function copyText(text, key) {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const role = session?.user?.user_metadata?.role
  const isAdmin = isSuperAdmin(session) || role === 'admin'
  const userEmail = session?.user?.email

  // Esperar a que la sesión cargue antes de fetch (evita queries con email=undefined)
  useEffect(() => {
    if (session === undefined) return
    fetchData()
  }, [session?.user?.id])

  async function fetchData() {
    setLoading(true)

    let allowedTruckIds = null // null = todos

    if (!isAdmin) {
      // Primero intentar allowed_trucks configurados en permisos
      const fromPerms = getAllowedTruckIds(session)
      if (fromPerms && fromPerms.length > 0) {
        allowedTruckIds = fromPerms
      } else {
        // Fallback: truck_ids de las órdenes asignadas al dispatcher
        const { data: orders } = await supabase
          .from('orders')
          .select('truck_id')
          .eq('dispatcher', userEmail)
          .not('truck_id', 'is', null)
        allowedTruckIds = [...new Set((orders || []).map(o => o.truck_id))]
      }
    }

    const cId = getActiveCompanyId()
    // Fetch trucks
    let trucksData = []
    if (allowedTruckIds === null) {
      const q = supabase.from('trucks').select('id, name, number, vin_number').order('name')
      const { data } = cId ? await q.eq('company_id', cId) : await q
      trucksData = data || []
    } else if (allowedTruckIds.length > 0) {
      const { data } = await supabase.from('trucks').select('id, name, number, vin_number').in('id', allowedTruckIds).order('name')
      trucksData = data || []
    }

    const trucksMap = {}
    trucksData.forEach(t => { trucksMap[t.id] = t })
    setTrucks(trucksMap)

    // Fetch drivers
    let driversData = []
    if (allowedTruckIds === null) {
      const q = supabase.from('drivers').select('*').eq('status', 'active').order('name')
      const { data } = cId ? await q.eq('company_id', cId) : await q
      driversData = data || []
    } else if (allowedTruckIds.length > 0) {
      const { data } = await supabase.from('drivers').select('*').in('truck_id', allowedTruckIds).eq('status', 'active').order('name')
      driversData = data || []
    }

    setDrivers(driversData)

    // Fetch documents
    if (driversData.length > 0 || trucksData.length > 0) {
      const driverIds = driversData.map(d => d.id)
      const truckIds = trucksData.map(t => t.id)
      const [{ data: ddocs }, { data: tdocs }] = await Promise.all([
        driverIds.length ? supabase.from('driver_documents').select('*').in('driver_id', driverIds) : Promise.resolve({ data: [] }),
        truckIds.length ? supabase.from('truck_documents').select('*').in('truck_id', truckIds) : Promise.resolve({ data: [] }),
      ])
      const ddMap = {}
      for (const d of ddocs || []) {
        if (!ddMap[d.driver_id]) ddMap[d.driver_id] = []
        ddMap[d.driver_id].push(d)
      }
      const tdMap = {}
      for (const d of tdocs || []) {
        if (!tdMap[d.truck_id]) tdMap[d.truck_id] = []
        tdMap[d.truck_id].push(d)
      }
      setDriverDocs(ddMap)
      setTruckDocs(tdMap)
    }

    setLoading(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Conductores</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? 'Todos los conductores activos' : 'Conductores de tus órdenes asignadas'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <svg className="w-12 h-12 text-gray-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          <p className="text-gray-500 text-sm">No hay conductores asignados a tus órdenes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map(driver => {
            const truck = trucks[driver.truck_id]
            const licBadge = expiryBadge(driver.license_expiry)
            const medBadge = expiryBadge(driver.medical_card_expiry)
            return (
              <div key={driver.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">

                {/* Header: nombre + truck */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white text-sm leading-tight">{driver.name}</p>
                    {truck && (
                      <p className="text-xs text-orange-400 mt-0.5">
                        {truck.name} #{truck.number}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800/40 shrink-0">
                    Activo
                  </span>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {driver.phone && (
                    <div>
                      <p className="text-gray-500 mb-0.5">Teléfono</p>
                      <button onClick={() => copyText(driver.phone, `${driver.id}-phone`)}
                        className="text-gray-200 hover:text-orange-400 transition-colors flex items-center gap-1 group">
                        {driver.phone}
                        <svg className="w-3 h-3 text-gray-600 group-hover:text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          {copiedKey === `${driver.id}-phone` ? <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />}
                        </svg>
                      </button>
                    </div>
                  )}
                  {driver.email && (
                    <div>
                      <p className="text-gray-500 mb-0.5">Email</p>
                      <button onClick={() => copyText(driver.email, `${driver.id}-email`)}
                        className="text-gray-200 hover:text-orange-400 transition-colors flex items-center gap-1 truncate max-w-full group">
                        <span className="truncate">{driver.email}</span>
                        <svg className="w-3 h-3 text-gray-600 group-hover:text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          {copiedKey === `${driver.id}-email` ? <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />}
                        </svg>
                      </button>
                    </div>
                  )}
                  {driver.license_number && (
                    <div>
                      <p className="text-gray-500 mb-0.5">CDL #</p>
                      <button onClick={() => copyText(driver.license_number, `${driver.id}-cdl`)}
                        className="font-mono text-gray-200 hover:text-orange-400 transition-colors flex items-center gap-1 group">
                        {driver.license_number}{driver.license_state && <span className="text-gray-500 ml-0.5">({driver.license_state})</span>}
                        <svg className="w-3 h-3 text-gray-600 group-hover:text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          {copiedKey === `${driver.id}-cdl` ? <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />}
                        </svg>
                      </button>
                    </div>
                  )}
                  {truck?.vin_number && (
                    <div className="col-span-2">
                      <p className="text-gray-500 mb-0.5">VIN</p>
                      <button onClick={() => copyText(truck.vin_number, `${driver.id}-vin`)}
                        title="Click para copiar"
                        className="font-mono text-[11px] text-gray-200 break-all text-left w-full group flex items-start gap-1.5 hover:text-orange-400 transition-colors"
                      >
                        <span className="break-all">{truck.vin_number}</span>
                        <svg className="w-3 h-3 shrink-0 mt-0.5 transition-colors text-gray-600 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          {copiedKey === `${driver.id}-vin` ? <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />}
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Documentos */}
                {(() => {
                  const dd = driverDocs[driver.id] || []
                  const td = truckDocs[driver.truck_id] || []
                  const docs = [...dd.filter(d => ['license', 'medical_card'].includes(d.doc_type)), ...td.filter(d => d.doc_type === 'vin_picture')]
                  if (!docs.length) return null
                  return (
                    <div className="pt-2 border-t border-gray-800">
                      <p className="text-[10px] text-gray-500 mb-1.5">Documentos</p>
                      <div className="flex flex-wrap gap-2">
                        {docs.map(doc => {
                          const url = docUrl(doc.file_path)
                          const label = doc.doc_type === 'license' ? 'CDL' : doc.doc_type === 'medical_card' ? 'Med Card' : 'VIN'
                          return (
                            <button key={doc.id} onClick={() => setPreviewDoc(doc)}
                              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-2 py-1.5 transition-colors group"
                              title={`Ver ${label}`}
                            >
                              {isImage(doc.mime_type) ? (
                                <img src={url} alt={label} className="w-8 h-8 object-cover rounded" />
                              ) : (
                                <div className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center">
                                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                  </svg>
                                </div>
                              )}
                              <span className="text-[10px] text-gray-300 group-hover:text-white font-medium">{label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Expiry badges */}
                {(driver.license_expiry || driver.medical_card_expiry) && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-800">
                    {driver.license_expiry && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">CDL exp:</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${licBadge?.bg || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {fmt_date(driver.license_expiry)}
                          {licBadge && <span className="ml-1 opacity-80">({licBadge.label})</span>}
                        </span>
                      </div>
                    )}
                    {driver.medical_card_expiry && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">Med:</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${medBadge?.bg || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {fmt_date(driver.medical_card_expiry)}
                          {medBadge && <span className="ml-1 opacity-80">({medBadge.label})</span>}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {previewDoc && <DocPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  )
}
