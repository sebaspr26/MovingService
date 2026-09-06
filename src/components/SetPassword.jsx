import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

const glassInput = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  backdropFilter: 'blur(8px)',
}
const glassInputFocus = { border: '1px solid rgba(234,88,12,0.7)', background: 'rgba(255,255,255,0.09)' }

function GlassInput({ type = 'text', value, onChange, placeholder, required, icon, rightSlot, min, className = '' }) {
  return (
    <div className="relative group">
      {icon && (
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-orange-400 pointer-events-none">
          {icon}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        min={min}
        className={`w-full py-3 rounded-xl text-sm font-semibold text-white placeholder-gray-500 outline-none transition-all ${icon ? 'pl-10 pr-4' : 'px-4'} ${className}`}
        style={glassInput}
        onFocus={e => Object.assign(e.target.style, glassInputFocus)}
        onBlur={e => Object.assign(e.target.style, glassInput)}
      />
      {rightSlot && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightSlot}</div>}
    </div>
  )
}

function GlassSelect({ value, onChange, children, placeholder }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-white outline-none transition-all appearance-none"
      style={{ ...glassInput, color: value ? 'white' : '#6b7280' }}
      onFocus={e => Object.assign(e.target.style, { ...glassInputFocus, color: 'white' })}
      onBlur={e => Object.assign(e.target.style, { ...glassInput, color: value ? 'white' : '#6b7280' })}
    >
      {placeholder && <option value="" style={{ background: '#111' }}>{placeholder}</option>}
      {children}
    </select>
  )
}

function FileDropZone({ file, onFile, accept = 'image/*,.pdf', label }) {
  const ref = useRef()
  const [drag, setDrag] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      className="rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center py-5 px-3 text-center"
      style={{
        borderColor: drag ? 'rgba(234,88,12,0.6)' : file ? 'rgba(234,88,12,0.4)' : 'rgba(255,255,255,0.12)',
        background: file ? 'rgba(234,88,12,0.08)' : 'rgba(255,255,255,0.03)',
      }}
    >
      {file ? (
        <>
          <svg className="w-6 h-6 text-orange-400 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-xs font-semibold text-orange-300 truncate max-w-full px-2">{file.name}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Toca para cambiar</p>
        </>
      ) : (
        <>
          <svg className="w-6 h-6 text-gray-500 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-xs text-gray-400 font-semibold">{label}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">PDF, JPG, PNG</p>
        </>
      )}
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = '' }} />
    </div>
  )
}

const DRIVER_STEPS = [
  { label: 'Contraseña' },
  { label: 'Tu perfil' },
  { label: 'Licencia' },
  { label: 'Tarjeta médica' },
]

export default function SetPassword() {
  const navigate = useNavigate()

  // Session state
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Step (driver flow: 1-4)
  const [step, setStep] = useState(1)

  // Step 1 — Contraseña
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Step 2 — Perfil
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const avatarRef = useRef()

  // Step 3 — Licencia
  const [licenseNumber, setLicenseNumber] = useState('')
  const [licenseState, setLicenseState] = useState('')
  const [licenseExpiry, setLicenseExpiry] = useState('')
  const [licenseFile, setLicenseFile] = useState(null)

  // Step 4 — Tarjeta médica
  const [medicalExpiry, setMedicalExpiry] = useState('')
  const [medicalFile, setMedicalFile] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        const meta = session.user?.user_metadata || {}
        setName(meta.name || '')
        setUserRole(meta.role || '')
        setUserEmail(session.user?.email || '')
        setReady(true)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const meta = data.session.user?.user_metadata || {}
        setName(meta.name || '')
        setUserRole(meta.role || '')
        setUserEmail(data.session.user?.email || '')
        setReady(true)
      } else {
        if (!window.location.hash.includes('access_token')) setExpired(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const isDriver = userRole === 'driver' || userRole === 'driver_lease'
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : userEmail?.slice(0, 2).toUpperCase() || '?'

  function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  // ── Non-driver simple submit ─────────────────────────────────────────────
  async function handleSimpleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password, data: { needs_password: false } })
      if (error) throw error
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Error al establecer la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  // ── Driver step navigation ───────────────────────────────────────────────
  function handleNext() {
    setError('')
    if (step === 1) {
      if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
      if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    }
    if (step === 2) {
      if (!name.trim()) { setError('El nombre es requerido.'); return }
    }
    if (step === 3) {
      if (!licenseNumber.trim()) { setError('Ingresa tu número de licencia.'); return }
      if (!licenseState) { setError('Selecciona el estado de tu licencia.'); return }
      if (!licenseExpiry) { setError('Ingresa la fecha de vencimiento de tu licencia.'); return }
      if (!licenseFile) { setError('Sube una foto o PDF de tu licencia.'); return }
    }
    setStep(s => s + 1)
  }

  // ── Driver final submit ──────────────────────────────────────────────────
  async function handleDriverSubmit(e) {
    e.preventDefault()
    setError('')
    if (!medicalExpiry) { setError('Ingresa la fecha de vencimiento de tu tarjeta médica.'); return }
    if (!medicalFile) { setError('Sube una foto o PDF de tu tarjeta médica.'); return }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id

      // Upload avatar
      let avatarPath = session?.user?.user_metadata?.avatar_path || null
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop()
        const path = `user-avatars/${userId}/avatar_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('company-docs').upload(path, avatarFile)
        if (!upErr) avatarPath = path
      }

      // Set password + update metadata
      const { error: pwErr } = await supabase.auth.updateUser({
        password,
        data: { needs_password: false, name: name.trim(), phone: phone || null, avatar_path: avatarPath },
      })
      if (pwErr) throw pwErr

      // Upsert driver record
      let driverId = null
      const { data: existing } = await supabase.from('drivers').select('id').eq('email', userEmail).maybeSingle()
      if (existing) {
        driverId = existing.id
        await supabase.from('drivers').update({
          name: name.trim(), phone: phone || null,
          license_number: licenseNumber, license_state: licenseState, license_expiry: licenseExpiry,
          medical_card_expiry: medicalExpiry, status: 'active',
        }).eq('id', driverId)
      } else {
        const { data: created } = await supabase.from('drivers').insert({
          name: name.trim(), phone: phone || null, email: userEmail,
          license_number: licenseNumber, license_state: licenseState, license_expiry: licenseExpiry,
          medical_card_expiry: medicalExpiry, status: 'active',
        }).select().single()
        driverId = created?.id
      }

      // Upload license document
      if (licenseFile && driverId) {
        const ext = licenseFile.name.split('.').pop()
        const path = `drivers/${driverId}/license_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('company-docs').upload(path, licenseFile)
        if (!upErr) {
          await supabase.from('driver_documents').insert({
            driver_id: driverId, doc_type: 'license', label: 'Licencia de conducir',
            file_name: licenseFile.name, file_path: path, file_size: licenseFile.size, mime_type: licenseFile.type,
          })
        }
      }

      // Upload medical card document
      if (medicalFile && driverId) {
        const ext = medicalFile.name.split('.').pop()
        const path = `drivers/${driverId}/medical_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('company-docs').upload(path, medicalFile)
        if (!upErr) {
          await supabase.from('driver_documents').insert({
            driver_id: driverId, doc_type: 'medical_card', label: 'Tarjeta médica',
            file_name: medicalFile.name, file_path: path, file_size: medicalFile.size, mime_type: medicalFile.type,
          })
        }
      }

      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Error al activar la cuenta.')
    } finally {
      setLoading(false)
    }
  }

  // ── Expired ──────────────────────────────────────────────────────────────
  if (expired) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Link expirado</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Este link de invitación ya fue usado o ha expirado. Contacta al administrador para recibir una nueva invitación.
          </p>
        </div>
      </div>
    )
  }

  // ── Shell ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative overflow-hidden flex">
      <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover">
        <source src="/truck-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/65" />

      <div className="relative z-10 flex items-center justify-center min-h-screen w-full px-6 py-10">
        <div
          className={`w-full ${isDriver ? 'max-w-lg' : 'max-w-md'}`}
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateX(0)' : 'translateX(-30px)',
            transition: 'opacity 0.7s ease, transform 0.7s ease',
          }}
        >
          <div
            className="rounded-2xl p-8 border border-white/10"
            style={{ background: 'rgba(10,10,15,0.65)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
          >
            {/* Header */}
            <div className="mb-6">
              <div
                className="w-12 h-12 rounded-full overflow-hidden relative flex items-center justify-center text-base font-bold text-white mb-4"
                style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 4px 20px rgba(234,88,12,0.4)' }}
              >
                {initials}
                {avatarPreview && <img src={avatarPreview} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              </div>
              <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>
                {name ? `Bienvenido, ${name.split(' ')[0]}` : 'Bienvenido'}
              </h1>
              <p className="text-gray-400 text-sm">
                {isDriver ? 'Activa tu cuenta y completa tu información' : 'Crea tu contraseña para acceder al sistema'}
              </p>
              <div className="mt-3 h-0.5 w-10 rounded-full" style={{ background: 'linear-gradient(90deg, #ea580c, #fb923c)' }} />
            </div>

            {/* Driver step indicator */}
            {isDriver && (
              <div className="flex items-center gap-1.5 mb-6">
                {DRIVER_STEPS.map((s, i) => {
                  const n = i + 1
                  const done = step > n
                  const active = step === n
                  return (
                    <div key={n} className="flex items-center gap-1.5 flex-1">
                      <div
                        className="flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 transition-all"
                        style={{
                          width: 22, height: 22,
                          background: done ? '#ea580c' : active ? 'rgba(234,88,12,0.2)' : 'rgba(255,255,255,0.06)',
                          border: done ? 'none' : active ? '1.5px solid rgba(234,88,12,0.7)' : '1.5px solid rgba(255,255,255,0.12)',
                          color: done || active ? (done ? 'white' : '#ea580c') : '#4b5563',
                        }}
                      >
                        {done ? (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : n}
                      </div>
                      <span className={`text-[10px] font-medium hidden sm:block ${active ? 'text-orange-400' : done ? 'text-gray-400' : 'text-gray-600'}`}>
                        {s.label}
                      </span>
                      {i < DRIVER_STEPS.length - 1 && (
                        <div className="flex-1 h-px" style={{ background: done ? 'rgba(234,88,12,0.4)' : 'rgba(255,255,255,0.08)' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Loading */}
            {!ready ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : isDriver ? (
              // ── DRIVER FLOW ──
              <div className="space-y-4">

                {/* Step 1: Contraseña */}
                {step === 1 && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Nueva Contraseña</label>
                      <GlassInput
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError('') }}
                        placeholder="Mínimo 8 caracteres"
                        icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>}
                        rightSlot={
                          <button type="button" onClick={() => setShowPassword(v => !v)} className="text-gray-500 hover:text-gray-300 transition-colors">
                            {showPassword
                              ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                            }
                          </button>
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Confirmar Contraseña</label>
                      <GlassInput
                        type={showPassword ? 'text' : 'password'}
                        value={confirm}
                        onChange={e => { setConfirm(e.target.value); setError('') }}
                        placeholder="Repite tu contraseña"
                        icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>}
                      />
                    </div>
                  </>
                )}

                {/* Step 2: Perfil */}
                {step === 2 && (
                  <>
                    {/* Foto de perfil */}
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full overflow-hidden relative flex items-center justify-center text-lg font-bold text-white shrink-0 cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
                        onClick={() => avatarRef.current?.click()}
                      >
                        {initials}
                        {avatarPreview && <img src={avatarPreview} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <button type="button" onClick={() => avatarRef.current?.click()} className="text-xs text-orange-400 hover:text-orange-300 font-semibold transition-colors">
                          {avatarPreview ? 'Cambiar foto' : 'Agregar foto'} <span className="text-gray-600 font-normal">(opcional)</span>
                        </button>
                        <p className="text-[10px] text-gray-600 mt-0.5">JPG, PNG o WebP · Max 5MB</p>
                      </div>
                      <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Nombre completo *</label>
                      <GlassInput value={name} onChange={e => { setName(e.target.value); setError('') }} placeholder="Tu nombre completo" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Teléfono <span className="normal-case text-gray-600 font-normal">(USA, opcional)</span></label>
                      <GlassInput
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(formatPhone(e.target.value))}
                        placeholder="(555) 555-5555"
                        icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>}
                      />
                    </div>
                  </>
                )}

                {/* Step 3: Licencia */}
                {step === 3 && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Número de licencia *</label>
                        <GlassInput value={licenseNumber} onChange={e => { setLicenseNumber(e.target.value.toUpperCase()); setError('') }} placeholder="Ej: D1234567" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Estado *</label>
                        <GlassSelect value={licenseState} onChange={e => { setLicenseState(e.target.value); setError('') }} placeholder="Estado">
                          {US_STATES.map(s => <option key={s} value={s} style={{ background: '#111' }}>{s}</option>)}
                        </GlassSelect>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Vencimiento *</label>
                        <GlassInput type="date" value={licenseExpiry} onChange={e => { setLicenseExpiry(e.target.value); setError('') }} min={new Date().toISOString().split('T')[0]} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Documento de licencia *</label>
                      <FileDropZone file={licenseFile} onFile={f => { setLicenseFile(f); setError('') }} label="Sube tu licencia (foto o PDF)" />
                    </div>
                  </>
                )}

                {/* Step 4: Tarjeta médica */}
                {step === 4 && (
                  <form onSubmit={handleDriverSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Vencimiento tarjeta médica *</label>
                      <GlassInput type="date" value={medicalExpiry} onChange={e => { setMedicalExpiry(e.target.value); setError('') }} min={new Date().toISOString().split('T')[0]} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Documento tarjeta médica *</label>
                      <FileDropZone file={medicalFile} onFile={f => { setMedicalFile(f); setError('') }} label="Sube tu tarjeta médica (foto o PDF)" />
                    </div>

                    <ErrorBox error={error} />

                    <div className="flex gap-3 pt-1">
                      <button type="button" onClick={() => { setStep(3); setError('') }}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400 hover:text-white transition-colors"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        ← Atrás
                      </button>
                      <button type="submit" disabled={loading}
                        className="flex-[2] py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 4px 24px rgba(234,88,12,0.4)' }}>
                        {loading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Activando...</span> : 'Activar Cuenta →'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Error (steps 1-3) */}
                {step < 4 && <ErrorBox error={error} />}

                {/* Navigation (steps 1-3) */}
                {step < 4 && (
                  <div className="flex gap-3 pt-1">
                    {step > 1 && (
                      <button type="button" onClick={() => { setStep(s => s - 1); setError('') }}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400 hover:text-white transition-colors"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        ← Atrás
                      </button>
                    )}
                    <button type="button" onClick={handleNext}
                      className={`py-3 rounded-xl text-sm font-bold text-white ${step === 1 ? 'w-full' : 'flex-[2]'}`}
                      style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 4px 24px rgba(234,88,12,0.4)' }}>
                      Continuar →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // ── NON-DRIVER FLOW ──
              <form onSubmit={handleSimpleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Nueva Contraseña</label>
                  <GlassInput
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder="Mínimo 8 caracteres"
                    icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>}
                    rightSlot={
                      <button type="button" onClick={() => setShowPassword(v => !v)} className="text-gray-500 hover:text-gray-300 transition-colors">
                        {showPassword
                          ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                        }
                      </button>
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Confirmar Contraseña</label>
                  <GlassInput
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => { setConfirm(e.target.value); setError('') }}
                    placeholder="Repite tu contraseña"
                    icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>}
                  />
                </div>
                <ErrorBox error={error} />
                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 4px 24px rgba(234,88,12,0.4)' }}>
                  {loading
                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</span>
                    : <span className="flex items-center justify-center gap-2">Activar Cuenta <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg></span>
                  }
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorBox({ error }) {
  return (
    <div style={{ maxHeight: error ? 48 : 0, opacity: error ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.3s ease' }}>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
        <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        <span className="text-xs text-red-400">{error}</span>
      </div>
    </div>
  )
}
