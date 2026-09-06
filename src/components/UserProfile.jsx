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

const TRUCK_DOC_LABELS = {
  license_plate: 'License Plate',
  cab_card: 'Cab Card',
  truck_picture: 'Foto del Camión',
  vin_picture: 'Foto del VIN',
  other: 'Otro',
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
  // Editable driver credentials
  const [licenseNumber, setLicenseNumber] = useState('')
  const [licenseState, setLicenseState] = useState('')
  const [licenseExpiry, setLicenseExpiry] = useState('')
  const [medicalExpiry, setMedicalExpiry] = useState('')
  const [driverDirty, setDriverDirty] = useState(false)
  const [savingDriver, setSavingDriver] = useState(false)
  // Truck documents
  const [truckDocs, setTruckDocs] = useState([])
  const [uploadingTruckDoc, setUploadingTruckDoc] = useState(false)
  const [selectedTruckDocType, setSelectedTruckDocType] = useState('license_plate')
  const truckDocRef = useRef()

  useEffect(() => {
    if (!isDriver || !user?.email) return
    setDriverLoading(true)
    ;(async () => {
      const { data: dr } = await supabase.from('drivers').select('*').eq('email', user.email).maybeSingle()
      if (dr) {
        setDriverRecord(dr)
        setLicenseNumber(dr.license_number || '')
        setLicenseState(dr.license_state || '')
        setLicenseExpiry(dr.license_expiry || '')
        setMedicalExpiry(dr.medical_card_expiry || '')
        const driverDocsP = supabase.from('driver_documents').select('*').eq('driver_id', dr.id)
        if (dr.truck_id) {
          const [truckRes, tdocsRes, ddocsRes] = await Promise.all([
            supabase.from('trucks').select('name, number, id').eq('id', dr.truck_id).maybeSingle(),
            supabase.from('truck_documents').select('*').eq('truck_id', dr.truck_id),
            driverDocsP,
          ])
          setAssignedTruck(truckRes.data)
          setTruckDocs(tdocsRes.data || [])
          setDriverDocs(ddocsRes.data || [])
        } else {
          const { data: docs } = await driverDocsP
          setDriverDocs(docs || [])
        }
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

  async function handleSaveDriverInfo() {
    setSavingDriver(true)
    try {
      const { error } = await supabase.from('drivers').update({
        license_number: licenseNumber || null,
        license_state: licenseState || null,
        license_expiry: licenseExpiry || null,
        medical_card_expiry: medicalExpiry || null,
      }).eq('id', driverRecord.id)
      if (error) throw error
      setDriverRecord(prev => ({ ...prev, license_number: licenseNumber, license_state: licenseState, license_expiry: licenseExpiry, medical_card_expiry: medicalExpiry }))
      setDriverDirty(false)
      toast.success('Información actualizada')
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setSavingDriver(false)
    }
  }

  async function handleUploadTruckDoc(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('El archivo no puede superar 20MB'); return }
    setUploadingTruckDoc(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `truck-docs/${driverRecord.truck_id}/${selectedTruckDocType}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('company-docs').upload(path, file)
      if (upErr) throw upErr
      const { data: newDoc, error: dbErr } = await supabase.from('truck_documents').insert({
        truck_id: driverRecord.truck_id,
        doc_type: selectedTruckDocType,
        label: TRUCK_DOC_LABELS[selectedTruckDocType],
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
      }).select().single()
      if (dbErr) throw dbErr
      setTruckDocs(prev => [...prev, newDoc])
      toast.success('Documento subido')
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setUploadingTruckDoc(false)
      e.target.value = ''
    }
  }

  // ── Shared sub-components ──
  const AvatarBlock = (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div
            className="w-16 h-16 rounded-full overflow-hidden relative flex items-center justify-center text-xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
          >
            {initials}
            {avatarUrl && <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          </div>
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{name || user?.email}</p>
          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          <span className="inline-block mt-1 text-[10px] bg-orange-600/15 text-orange-400 border border-orange-600/30 px-2 py-0.5 rounded-full font-medium">
            {ROLE_NAMES[meta.role] || meta.role || 'Admin'}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 transition-colors disabled:opacity-50"
          >
            {avatarUrl ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {avatarUrl && (
            <button onClick={handleRemoveAvatar} disabled={uploading}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50 text-center">
              Quitar foto
            </button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
    </div>
  )

  const PersonalInfoBlock = (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Información personal</p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Nombre completo</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/70" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Email</label>
          <input type="email" value={user?.email || ''} readOnly
            className="w-full bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Teléfono <span className="text-gray-600">(USA)</span></label>
          <input type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(555) 555-5555"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/70" />
        </div>
        {!isDriver && (
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Rol</label>
            <input type="text" value={ROLE_NAMES[meta.role] || meta.role || 'Admin'} readOnly
              className="w-full bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed" />
          </div>
        )}
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={handleSave} disabled={!dirty || saving}
          className="px-5 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )

  // ── Non-driver layout ──
  if (!isDriver) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Mi Perfil</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona tu información personal</p>
        </div>
        <div className="space-y-4">
          {AvatarBlock}
          {PersonalInfoBlock}
        </div>
      </div>
    )
  }

  // ── Driver layout — 2-column grid ──
  const InfoRow = ({ label, value, colorClass }) => (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm font-medium ${colorClass || 'text-white'}`}>{value || <span className="text-gray-600">—</span>}</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Mi Perfil</h1>
        <p className="text-sm text-gray-500 mt-1">Tu información personal y de conductor</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Columna izquierda: avatar + info editable */}
        <div className="space-y-4">
          {AvatarBlock}
          {PersonalInfoBlock}
        </div>

        {/* Columna derecha: datos de conductor + documentos */}
        <div className="space-y-4">

          {/* Credenciales — editable */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Datos de conductor</p>
              {assignedTruck && (
                <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-600/10 border border-orange-600/20 rounded-full px-2.5 py-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                  {assignedTruck.name} #{assignedTruck.number}
                </div>
              )}
            </div>

            {driverLoading ? (
              <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-9 bg-gray-800 rounded animate-pulse" />)}</div>
            ) : (
              <div className="space-y-4">
                {/* Licencia */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2.5">Licencia de conducción</p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Número</label>
                        <input type="text" value={licenseNumber}
                          onChange={e => { setLicenseNumber(e.target.value); setDriverDirty(true) }}
                          placeholder="CDL-123456"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/70" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Estado</label>
                        <select value={licenseState}
                          onChange={e => { setLicenseState(e.target.value); setDriverDirty(true) }}
                          className="sel w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/70">
                          <option value="">—</option>
                          {Object.entries(US_STATE_NAMES).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Vencimiento</label>
                      <div className="flex items-center gap-2">
                        <input type="date" value={licenseExpiry}
                          onChange={e => { setLicenseExpiry(e.target.value); setDriverDirty(true) }}
                          className="sel flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/70" />
                        {licenseExpiry && <span className={`text-xs shrink-0 ${expiryColor(licenseExpiry)}`}>{expiryBadge(licenseExpiry)}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Medical */}
                <div className="border-t border-gray-800 pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2.5">Tarjeta médica</p>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Vencimiento</label>
                    <div className="flex items-center gap-2">
                      <input type="date" value={medicalExpiry}
                        onChange={e => { setMedicalExpiry(e.target.value); setDriverDirty(true) }}
                        className="sel flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/70" />
                      {medicalExpiry && <span className={`text-xs shrink-0 ${expiryColor(medicalExpiry)}`}>{expiryBadge(medicalExpiry)}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button onClick={handleSaveDriverInfo} disabled={!driverDirty || savingDriver}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}>
                    {savingDriver ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Documentos personales del conductor */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Mis documentos</p>
            {driverLoading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />)}</div>
            ) : driverDocs.length === 0 ? (
              <p className="text-sm text-gray-600">Sin documentos subidos</p>
            ) : (
              <div className="space-y-2">
                {driverDocs.map(doc => {
                  const url = getDocUrl(doc.file_path)
                  const isPdf = doc.mime_type === 'application/pdf' || doc.file_name?.toLowerCase().endsWith('.pdf')
                  const typeLabel = doc.doc_type === 'license' ? 'Licencia' : doc.doc_type === 'medical_card' ? 'Tarjeta médica' : doc.label || 'Documento'
                  return (
                    <a key={doc.id} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-800 hover:border-orange-600/40 hover:bg-gray-800 transition-colors group">
                      <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                        {isPdf
                          ? <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                          : <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{typeLabel}</p>
                        <p className="text-xs text-gray-500 truncate">{doc.file_name}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-600 group-hover:text-orange-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  )
                })}
              </div>
            )}
          </div>

          {/* Documentos del camión — solo si tiene truck asignado */}
          {(driverLoading || assignedTruck) && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Documentos del camión</p>
              </div>

              {driverLoading ? (
                <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />)}</div>
              ) : (
                <>
                  {truckDocs.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {truckDocs.map(doc => {
                        const url = getDocUrl(doc.file_path)
                        const isPdf = doc.mime_type === 'application/pdf' || doc.file_name?.toLowerCase().endsWith('.pdf')
                        const typeLabel = TRUCK_DOC_LABELS[doc.doc_type] || doc.label || 'Documento'
                        return (
                          <a key={doc.id} href={url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-800 hover:border-orange-600/40 hover:bg-gray-800 transition-colors group">
                            <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                              {isPdf
                                ? <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                                : <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white font-medium">{typeLabel}</p>
                              <p className="text-xs text-gray-500 truncate">{doc.file_name}</p>
                            </div>
                            <svg className="w-4 h-4 text-gray-600 group-hover:text-orange-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        )
                      })}
                    </div>
                  )}

                  {/* Upload nuevo documento del camión */}
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-500 mb-2">Subir documento</p>
                    <div className="flex gap-2">
                      <select value={selectedTruckDocType} onChange={e => setSelectedTruckDocType(e.target.value)}
                        className="sel flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/70">
                        {Object.entries(TRUCK_DOC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button onClick={() => truckDocRef.current?.click()} disabled={uploadingTruckDoc}
                        className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1.5">
                        {uploadingTruckDoc
                          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                        }
                        Subir
                      </button>
                    </div>
                    <input ref={truckDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUploadTruckDoc} />
                    <p className="text-[10px] text-gray-600 mt-2">Solo el administrador puede eliminar documentos existentes</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
