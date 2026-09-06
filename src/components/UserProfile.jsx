import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

const US_STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',
  IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',
  NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
  ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',
  SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'D.C.',
}

function expiryColor(dateStr) {
  if (!dateStr) return 'text-gray-500'
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (days < 0) return 'text-red-400'
  if (days <= 30) return 'text-yellow-400'
  return 'text-emerald-400'
}

function expiryBadge(dateStr) {
  if (!dateStr) return null
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (days < 0) return <span className="ml-2 text-[10px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded">Vencida</span>
  if (days <= 30) return <span className="ml-2 text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">Vence en {days}d</span>
  return null
}

function getDocUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('company-docs').getPublicUrl(path)
  return data?.publicUrl || null
}

const ROLE_NAMES = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  driver_lease: 'Driver LEASE',
}

function getAvatarUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('company-docs').getPublicUrl(path)
  return data?.publicUrl || null
}

export default function UserProfile() {
  const { session, refreshSession } = useAuth()
  const toast = useToast()
  const user = session?.user
  const meta = user?.user_metadata || {}

  const [name, setName] = useState(meta.name || '')
  const [phone, setPhone] = useState(meta.phone || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(() => getAvatarUrl(meta.avatar_path))
  const fileRef = useRef()

  const isDriver = meta.role === 'driver' || meta.role === 'driver_lease'
  const [driverRecord, setDriverRecord] = useState(null)
  const [driverDocs, setDriverDocs] = useState([])
  const [assignedTruck, setAssignedTruck] = useState(null)
  const [driverLoading, setDriverLoading] = useState(false)

  useEffect(() => {
    if (!isDriver || !user?.email) return
    setDriverLoading(true)
    ;(async () => {
      const { data: dr } = await supabase.from('drivers').select('*').eq('email', user.email).maybeSingle()
      if (dr) {
        setDriverRecord(dr)
        if (dr.truck_id) {
          const { data: truck } = await supabase.from('trucks').select('name, number').eq('id', dr.truck_id).maybeSingle()
          setAssignedTruck(truck)
        }
        const { data: docs } = await supabase.from('driver_documents').select('*').eq('driver_id', dr.id)
        setDriverDocs(docs || [])
      }
      setDriverLoading(false)
    })()
  }, [isDriver, user?.email])

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || '?'

  const dirty = name !== (meta.name || '') || phone !== (meta.phone || '')

  function formatPhone(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Solo se permiten imágenes'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no puede superar 5MB'); return }

    setUploading(true)
    try {
      if (meta.avatar_path) {
        await supabase.storage.from('company-docs').remove([meta.avatar_path])
      }
      const ext = file.name.split('.').pop()
      const path = `user-avatars/${user.id}/avatar_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('company-docs').upload(path, file)
      if (upErr) throw upErr

      const { error: updateErr } = await supabase.auth.updateUser({
        data: { ...meta, avatar_path: path },
      })
      if (updateErr) throw updateErr

      await refreshSession()
      setAvatarUrl(getAvatarUrl(path))
      toast.success('Foto actualizada')
    } catch (err) {
      toast.error('Error subiendo foto')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleRemoveAvatar() {
    const ok = await toast.confirm('¿Quitar la foto de perfil?')
    if (!ok) return
    setUploading(true)
    try {
      if (meta.avatar_path) {
        await supabase.storage.from('company-docs').remove([meta.avatar_path])
      }
      const { error } = await supabase.auth.updateUser({ data: { ...meta, avatar_path: null } })
      if (error) throw error
      await refreshSession()
      setAvatarUrl(null)
      toast.success('Foto eliminada')
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    const digits = phone.replace(/\D/g, '')
    if (phone && digits.length !== 10) {
      toast.warning('El teléfono debe tener 10 dígitos (formato USA)')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { ...meta, name, phone: phone || null } })
      if (error) throw error
      await refreshSession()
      toast.success('Perfil actualizado')
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Mi Perfil</h1>
        <p className="text-sm text-gray-500 mt-1">Gestiona tu información personal</p>
      </div>

      {/* Foto de perfil */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Foto de perfil</p>
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div
              className="w-20 h-20 rounded-full overflow-hidden relative flex items-center justify-center text-2xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
            >
              {initials}
              {avatarUrl && <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            </div>
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 transition-colors disabled:opacity-50"
            >
              {avatarUrl ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                disabled={uploading}
                className="px-4 py-2 text-sm text-left text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                Quitar foto
              </button>
            )}
            <p className="text-xs text-gray-600">JPG, PNG o WebP · Max 5MB</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
      </div>

      {/* Información personal */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Información personal</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre completo</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/70"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              className="w-full bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-600 mt-1">El email no se puede modificar desde aquí</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Teléfono <span className="text-gray-600">(USA)</span></label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(555) 555-5555"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/70"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Rol</label>
            <input
              type="text"
              value={ROLE_NAMES[meta.role] || meta.role || 'Admin'}
              readOnly
              className="w-full bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-6 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* ── Driver-only sections ── */}
      {isDriver && (
        <>
          {/* Truck asignado */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Camión asignado</p>
            {driverLoading ? (
              <div className="h-8 w-40 bg-gray-800 rounded animate-pulse" />
            ) : assignedTruck ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-600/15 border border-orange-600/30 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{assignedTruck.name}</p>
                  <p className="text-xs text-gray-500">#{assignedTruck.number}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Sin camión asignado — contacta al administrador</p>
            )}
          </div>

          {/* Licencia de conducción */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Licencia de conducción</p>
            {driverLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-800 rounded animate-pulse" />)}
              </div>
            ) : driverRecord ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Número de licencia</label>
                  <p className="text-sm text-white bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5">
                    {driverRecord.license_number || <span className="text-gray-600">—</span>}
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Estado emisor</label>
                  <p className="text-sm text-white bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5">
                    {driverRecord.license_state
                      ? `${driverRecord.license_state} — ${US_STATE_NAMES[driverRecord.license_state] || driverRecord.license_state}`
                      : <span className="text-gray-600">—</span>}
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha de vencimiento</label>
                  <p className={`text-sm bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5 flex items-center ${expiryColor(driverRecord.license_expiry)}`}>
                    {driverRecord.license_expiry || <span className="text-gray-600">—</span>}
                    {expiryBadge(driverRecord.license_expiry)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No hay información de licencia registrada</p>
            )}
          </div>

          {/* Tarjeta médica */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Tarjeta médica</p>
            {driverLoading ? (
              <div className="h-8 bg-gray-800 rounded animate-pulse" />
            ) : driverRecord ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha de vencimiento</label>
                <p className={`text-sm bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5 flex items-center ${expiryColor(driverRecord.medical_card_expiry)}`}>
                  {driverRecord.medical_card_expiry || <span className="text-gray-600">—</span>}
                  {expiryBadge(driverRecord.medical_card_expiry)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No hay información de tarjeta médica registrada</p>
            )}
          </div>

          {/* Documentos */}
          {driverDocs.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Documentos</p>
              <div className="space-y-2">
                {driverDocs.map(doc => {
                  const url = getDocUrl(doc.file_path)
                  const isPdf = doc.mime_type === 'application/pdf' || doc.file_name?.toLowerCase().endsWith('.pdf')
                  const typeLabel = doc.doc_type === 'license' ? 'Licencia' : doc.doc_type === 'medical_card' ? 'Tarjeta médica' : doc.label || 'Documento'
                  return (
                    <a
                      key={doc.id}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-800 hover:border-orange-600/40 hover:bg-gray-800 transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                        {isPdf ? (
                          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{typeLabel}</p>
                        <p className="text-xs text-gray-500 truncate">{doc.file_name}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-600 group-hover:text-orange-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
