import { useState, useEffect } from 'react'
import { useToast } from './Toast'
import { MODULES, defaultPermissions } from '../lib/permissions'
import { getActiveCompanyId } from '../lib/company'
import { supabase } from '../lib/supabase'

function getUserAvatarUrl(user) {
  const path = user.user_metadata?.avatar_path
  if (!path) return null
  const { data } = supabase.storage.from('company-docs').getPublicUrl(path)
  return data?.publicUrl || null
}
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'

const ROLE_LABELS = {
  super_admin: { label: 'Super Admin', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  admin: { label: 'Admin', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  dispatcher: { label: 'Dispatcher', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  driver: { label: 'Driver', color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
  driver_lease: { label: 'Driver LEASE', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
}

const INVITE_EXPIRY_MS = 40 * 60 * 1000 // 40 minutos

function getInviteStatus(user) {
  if (user.confirmed_at) return 'active'
  const sentAt = user.invited_at || user.created_at
  const elapsed = Date.now() - new Date(sentAt).getTime()
  return elapsed > INVITE_EXPIRY_MS ? 'expired' : 'pending'
}

function rolePriority(role) {
  const order = { super_admin: 0, admin: 1, dispatcher: 2, driver: 3, driver_lease: 4 }
  return order[role] ?? 99
}

const ROLE_GROUPS = [
  { label: 'Administradores', roles: ['super_admin', 'admin'] },
  { label: 'Dispatchers', roles: ['dispatcher'] },
  { label: 'Conductores', roles: ['driver', 'driver_lease'] },
]

function getInitials(name, email) {
  if (name) return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return email?.slice(0, 2).toUpperCase() || '??'
}

function ModuleCard({ mod, perms, toggleModule, toggleSub }) {
  const modEnabled = perms[mod.key]?.enabled !== false
  const hasSubs = mod.subs.length > 0
  return (
    <div className={`rounded-xl border p-3 transition-colors ${modEnabled ? 'border-gray-700 bg-gray-800/50' : 'border-gray-800 bg-gray-800/20'}`}>
      <button onClick={() => toggleModule(mod.key)} className={`w-full flex items-center justify-between ${hasSubs ? 'mb-2' : ''}`}>
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 shrink-0 ${modEnabled ? 'text-orange-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={mod.icon} />
          </svg>
          <span className={`text-xs font-bold ${modEnabled ? 'text-white' : 'text-gray-600'}`}>{mod.label}</span>
        </div>
        <div className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${modEnabled ? 'bg-orange-500' : 'bg-gray-700'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${modEnabled ? 'left-4' : 'left-0.5'}`} />
        </div>
      </button>
      {hasSubs && (
        <div className="border-t border-gray-700/40 pt-2 space-y-1">
          {mod.subs.map(sub => {
            const subEnabled = perms[mod.key]?.[sub.key] !== false
            return (
              <button
                key={sub.key}
                onClick={() => modEnabled && toggleSub(mod.key, sub.key)}
                disabled={!modEnabled}
                className="w-full flex items-center justify-between py-0.5 gap-2"
              >
                <span className={`text-[11px] text-left leading-tight ${modEnabled && subEnabled ? 'text-gray-300' : 'text-gray-600'}`}>{sub.label}</span>
                <div className={`w-7 h-3.5 rounded-full relative shrink-0 transition-colors ${modEnabled && subEnabled ? 'bg-orange-500/80' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${modEnabled && subEnabled ? 'left-3.5' : 'left-0.5'}`} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Profiles() {
  const [users, setUsers] = useState([])
  const [dbDrivers, setDbDrivers] = useState([])
  const [dbDispatchers, setDbDispatchers] = useState([])
  const [dbTrucks, setDbTrucks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create' | 'invite'
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' })
  const [submitting, setSubmitting] = useState(false)
  const [resendUser, setResendUser] = useState(null) // usuario original al reenviar
  const [permUser, setPermUser] = useState(null)
  const [perms, setPerms] = useState({})
  const [allowedCompanies, setAllowedCompanies] = useState([])
  const [allowedTrucks, setAllowedTrucks] = useState([])
  const [savingPerms, setSavingPerms] = useState(false)
  const [dispatcherRate, setDispatcherRate] = useState('')
  const [rateHistory, setRateHistory] = useState([])
  const toast = useToast()
  const { refreshSession } = useAuth()
  const { companies } = useCompany()

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    try {
      const [usersRes, driversRes, trucksRes, dispatchersRes] = await Promise.all([
        fetch('/api/invite-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list' }),
        }),
        supabase.from('drivers').select('id, name, email, phone, status').order('name'),
        supabase.from('trucks').select('id, name, number').order('number'),
        supabase.from('orders').select('dispatcher').not('dispatcher', 'is', null).neq('dispatcher', ''),
      ])
      const usersData = await usersRes.json().catch(() => ({}))
      if (!usersRes.ok) throw new Error(usersData?.error || `Error ${usersRes.status}`)
      const sorted = (usersData.users || []).sort((a, b) =>
        rolePriority(a.user_metadata?.role) - rolePriority(b.user_metadata?.role)
      )
      setUsers(sorted)
      setDbDrivers(driversRes.data || [])
      setDbTrucks(trucksRes.data || [])

      // Build name → email map from Auth users
      const nameToEmail = {}
      sorted.forEach(u => {
        const name = (u.user_metadata?.name || '').trim().toLowerCase()
        if (name && u.email) nameToEmail[name] = u.email
      })

      // Unique dispatcher values from orders
      const allDispatchers = [...new Set((dispatchersRes.data || []).map(o => o.dispatcher).filter(Boolean))]

      // Auto-migrate name-based dispatchers → email if we have a match
      const toMigrate = allDispatchers.filter(d => !d.includes('@') && nameToEmail[d.trim().toLowerCase()])
      for (const name of toMigrate) {
        const email = nameToEmail[name.trim().toLowerCase()]
        await supabase.from('orders').update({ dispatcher: email }).eq('dispatcher', name)
      }

      // Reload dispatcher list after migration
      const finalDispatchers = toMigrate.length > 0
        ? allDispatchers.map(d => (!d.includes('@') && nameToEmail[d.trim().toLowerCase()]) ? nameToEmail[d.trim().toLowerCase()] : d)
        : allDispatchers
      const uniqueDispatchers = [...new Set(finalDispatchers)].sort()
      setDbDispatchers(uniqueDispatchers)
    } catch (err) {
      toast.error('Error al cargar usuarios: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email) return
    if (modalMode === 'create' && !form.password) return

    setSubmitting(true)
    try {
      // Si es reenvío y el email cambió, eliminar el usuario viejo primero
      if (resendUser && resendUser.email !== form.email) {
        await fetch('/api/invite-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', email: resendUser.email, userId: resendUser.id }),
        })
      }

      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: modalMode,
          email: form.email,
          password: form.password,
          name: form.name,
          role: form.role,
          companyId: getActiveCompanyId(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)

      toast.success(modalMode === 'invite'
        ? `Invitación enviada a ${form.email}`
        : `Usuario ${form.email} creado exitosamente`
      )
      setShowModal(false)
      setResendUser(null)
      setForm({ name: '', email: '', password: '', role: 'user' })
      fetchUsers()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend(user) {
    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend',
          email: user.email,
          userId: user.id,
          name: user.user_metadata?.name,
          role: user.user_metadata?.role,
          companyId: getActiveCompanyId(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
      toast.success(`Invitación reenviada a ${user.email}`)
      fetchUsers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleUpdateRole(userId, newRole) {
    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_role', email: 'x', userId, role: newRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
      toast.success('Rol actualizado')
      fetchUsers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDelete(userId, email) {
    const confirmed = await toast.confirm(`¿Eliminar al usuario ${email}? Esta acción no se puede deshacer.`)
    if (!confirmed) return
    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', email, userId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
      toast.success('Usuario eliminado')
      fetchUsers()
    } catch (err) {
      toast.error(err.message)
    }
  }

  function openPermissions(user) {
    const defaults = defaultPermissions()
    const existing = user.user_metadata?.permissions || {}
    const merged = {}
    for (const mod of MODULES) {
      merged[mod.key] = {
        ...defaults[mod.key],
        ...(existing[mod.key] || {}),
      }
    }
    setPerms(merged)
    // allowed_companies: si no está definido, default = todas las empresas
    const existingAllowed = user.user_metadata?.allowed_companies
    setAllowedCompanies(existingAllowed ?? companies.map(c => c.id))
    const existingTrucks = user.user_metadata?.allowed_trucks
    setAllowedTrucks(existingTrucks ?? dbTrucks.map(t => t.id))
    // Dispatcher rate history
    const rates = user.user_metadata?.dispatcher_rates || []
    setRateHistory(rates)
    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthEntry = rates.find(r => r.month === currentMonth)
    const lastEntry = rates[rates.length - 1]
    setDispatcherRate(monthEntry ? String(monthEntry.pct) : lastEntry ? String(lastEntry.pct) : '')
    setPermUser(user)
  }

  function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    return date.toLocaleDateString('es-US', { month: 'short', year: 'numeric' })
  }

  function toggleModule(modKey) {
    setPerms(prev => ({
      ...prev,
      [modKey]: { ...prev[modKey], enabled: !prev[modKey]?.enabled },
    }))
  }

  function toggleSub(modKey, subKey) {
    setPerms(prev => ({
      ...prev,
      [modKey]: { ...prev[modKey], [subKey]: !prev[modKey]?.[subKey] },
    }))
  }

  async function savePermissions() {
    setSavingPerms(true)
    try {
      // Build rate history — only update current month, preserve past months
      let newRates = [...rateHistory]
      if (dispatcherRate !== '' && !isNaN(parseFloat(dispatcherRate))) {
        const pct = parseFloat(dispatcherRate)
        const currentMonth = new Date().toISOString().slice(0, 7)
        const idx = newRates.findIndex(r => r.month === currentMonth)
        if (idx >= 0) newRates[idx] = { month: currentMonth, pct }
        else newRates.push({ month: currentMonth, pct })
      }

      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_permissions', email: permUser.email, userId: permUser.id, permissions: perms, allowed_companies: allowedCompanies, allowed_trucks: allowedTrucks, dispatcher_rates: newRates }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
      toast.success('Permisos guardados')
      setPermUser(null)
      fetchUsers()
      refreshSession()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingPerms(false)
    }
  }

  function openModal(mode) {
    setResendUser(null)
    setModalMode(mode)
    setForm({ name: '', email: '', password: '', role: 'admin' })
    setShowModal(true)
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Perfiles de Usuario</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona los usuarios con acceso al sistema</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openModal('invite')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
            Enviar Invitación
          </button>
          <button
            onClick={() => openModal('create')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 2px 12px rgba(234,88,12,0.3)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-24 text-gray-500">No hay usuarios registrados</div>
      ) : (
        <div className="space-y-8">
          {ROLE_GROUPS.map(group => {
            const groupUsers = users.filter(u => group.roles.includes(u.user_metadata?.role || 'admin'))
            // For Conductores, add drivers from DB without Auth account
            const isDriverGroup = group.roles.includes('driver')
            const isDispatcherGroup = group.roles.includes('dispatcher')
            const authEmails = new Set(groupUsers.map(u => u.email?.toLowerCase()))
            // Compare dispatcher names against ALL auth users — full name + tokens + email prefix
            const allAuthNames = new Set(users.map(u => (u.user_metadata?.name || '').toLowerCase()).filter(Boolean))
            const allAuthTokens = new Set(
              users.flatMap(u => [
                ...(u.user_metadata?.name || '').toLowerCase().split(/\s+/),
                u.email?.toLowerCase().split('@')[0] || '',
              ]).filter(Boolean)
            )
            const unlinkedDrivers = isDriverGroup
              ? dbDrivers.filter(d => !d.email || !authEmails.has(d.email?.toLowerCase()))
              : []
            const allAuthEmails = new Set(users.map(u => u.email?.toLowerCase()).filter(Boolean))
            const unlinkedDispatchers = isDispatcherGroup
              ? dbDispatchers.filter(val => {
                  if (val.includes('@')) {
                    // Email-based dispatcher: linked if an auth user has this email
                    return !allAuthEmails.has(val.toLowerCase())
                  }
                  // Legacy name-based: exclude if full name or any token matches any auth user
                  if (allAuthNames.has(val.toLowerCase())) return false
                  const tokens = val.toLowerCase().split(/\s+/)
                  return !tokens.some(t => allAuthTokens.has(t))
                })
              : []
            const totalCount = groupUsers.length + unlinkedDrivers.length + unlinkedDispatchers.length
            if (totalCount === 0) return null
            return (
              <div key={group.label}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{group.label}</h2>
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-xs text-gray-700">{totalCount}</span>
                </div>
                <div className="space-y-2">
                  {/* Auth users */}
                  {groupUsers.map(user => {
                    const name = user.user_metadata?.name || ''
                    const role = user.user_metadata?.role || 'admin'
                    const roleConfig = ROLE_LABELS[role] || ROLE_LABELS.admin
                    const status = getInviteStatus(user)
                    const inactive = status !== 'active'
                    const lastSignIn = user.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Nunca'

                    return (
                      <div
                        key={user.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border bg-gray-900 hover:border-gray-700 transition-colors ${inactive ? 'border-gray-800/60 opacity-50 grayscale' : 'border-gray-800'}`}
                      >
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 rounded-full overflow-hidden relative flex items-center justify-center text-sm font-bold text-white shrink-0"
                          style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
                        >
                          {getInitials(name, user.email)}
                          {getUserAvatarUrl(user) && <img src={getUserAvatarUrl(user)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white truncate">{name || user.email}</p>
                            <select
                              value={role}
                              onChange={e => handleUpdateRole(user.id, e.target.value)}
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium bg-transparent cursor-pointer focus:outline-none ${roleConfig.color}`}
                            >
                              {Object.entries(ROLE_LABELS).map(([key, { label }]) => (
                                <option key={key} value={key} className="bg-gray-900 text-gray-200">{label}</option>
                              ))}
                            </select>
                          </div>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{user.email}</p>
                        </div>

                        {/* Último acceso */}
                        <div className="hidden md:block text-right shrink-0">
                          <p className="text-xs text-gray-600">Último acceso</p>
                          <p className="text-xs text-gray-400 mt-0.5">{lastSignIn}</p>
                        </div>

                        {/* Estado + Acciones */}
                        <div className="flex items-center gap-2 shrink-0">
                          {status === 'active' ? (
                            <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                              Activo
                            </span>
                          ) : status === 'pending' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                                Solicitud enviada
                              </span>
                              <button
                                onClick={() => {
                                  setResendUser(user)
                                  setModalMode('invite')
                                  setForm({ name: user.user_metadata?.name || '', email: user.email, password: '', role: user.user_metadata?.role || 'admin' })
                                  setShowModal(true)
                                }}
                                className="px-2 py-0.5 text-xs rounded-md bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 transition-colors font-medium"
                                title="Reenviar invitación"
                              >
                                Reenviar
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                Expirado
                              </span>
                              <button
                                onClick={() => {
                                  setResendUser(user)
                                  setModalMode('invite')
                                  setForm({ name: user.user_metadata?.name || '', email: user.email, password: '', role: user.user_metadata?.role || 'admin' })
                                  setShowModal(true)
                                }}
                                className="px-2 py-0.5 text-xs rounded-md bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 transition-colors font-medium"
                                title="Reenviar invitación"
                              >
                                Reenviar
                              </button>
                            </div>
                          )}

                          {role !== 'super_admin' && (
                            <button
                              onClick={() => openPermissions(user)}
                              className="p-2 rounded-lg text-gray-600 hover:text-orange-400 hover:bg-orange-400/10 transition-colors"
                              title="Configurar permisos"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(user.id, user.email)}
                            className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Eliminar usuario"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Dispatchers from orders without Auth account */}
                  {unlinkedDispatchers.map(name => (
                    <div
                      key={`dispatcher-${name}`}
                      className="flex items-center gap-4 p-4 rounded-xl border border-gray-800/60 bg-gray-900 hover:border-gray-700 transition-colors opacity-50 grayscale"
                    >
                      <div
                        className="w-10 h-10 rounded-full overflow-hidden relative flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                      >
                        {getInitials(name, '')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">{name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_LABELS.dispatcher.color}`}>
                            {ROLE_LABELS.dispatcher.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">Registrado en órdenes</p>
                      </div>
                      <div className="hidden md:block text-right shrink-0">
                        <p className="text-xs text-gray-600">Último acceso</p>
                        <p className="text-xs text-gray-400 mt-0.5">Nunca</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                          Sin cuenta
                        </span>
                        <button
                          onClick={() => {
                            setModalMode('invite')
                            setForm({ name, email: '', password: '', role: 'dispatcher' })
                            setShowModal(true)
                          }}
                          className="px-2 py-0.5 text-xs rounded-md bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 transition-colors font-medium"
                        >
                          Invitar
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Drivers from DB without Auth account */}
                  {unlinkedDrivers.map(driver => (
                    <div
                      key={`driver-${driver.id}`}
                      className="flex items-center gap-4 p-4 rounded-xl border border-gray-800/60 bg-gray-900 hover:border-gray-700 transition-colors opacity-50 grayscale"
                    >
                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-full overflow-hidden relative flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                      >
                        {getInitials(driver.name, driver.email)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">{driver.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_LABELS.driver.color}`}>
                            {ROLE_LABELS.driver.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{driver.email || driver.phone || 'Sin contacto registrado'}</p>
                      </div>

                      {/* Último acceso */}
                      <div className="hidden md:block text-right shrink-0">
                        <p className="text-xs text-gray-600">Último acceso</p>
                        <p className="text-xs text-gray-400 mt-0.5">Nunca</p>
                      </div>

                      {/* Estado */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                          Sin cuenta
                        </span>
                        {driver.email && (
                          <button
                            onClick={() => {
                              setModalMode('invite')
                              setForm({ name: driver.name, email: driver.email, password: '', role: 'driver' })
                              setShowModal(true)
                            }}
                            className="px-2 py-0.5 text-xs rounded-md bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 transition-colors font-medium"
                          >
                            Invitar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Permisos — 2 columnas */}
      {permUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPermUser(null)} />
          <div className="relative w-full max-w-5xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-full overflow-hidden relative flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}>
                  {getInitials(permUser.user_metadata?.name, permUser.email)}
                  {getUserAvatarUrl(permUser) && (
                    <img src={getUserAvatarUrl(permUser)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </div>
                <div>
                  <p className="text-base font-bold text-white leading-tight">{permUser.user_metadata?.name || permUser.email}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{permUser.email}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${ROLE_LABELS[permUser.user_metadata?.role]?.color || 'text-gray-400 bg-gray-400/10 border-gray-400/20'}`}>
                  {ROLE_LABELS[permUser.user_metadata?.role]?.label || permUser.user_metadata?.role}
                </span>
              </div>
              <button onClick={() => setPermUser(null)} className="text-gray-500 hover:text-white transition-colors p-1.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body — 2 cols */}
            <div className="flex flex-1 overflow-hidden min-h-0">

              {/* Columna izquierda: Permisos en 2 sub-columnas independientes */}
              <div className="flex-1 p-5 overflow-y-auto border-r border-gray-800">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Módulos y permisos</p>
                <div className="flex gap-2.5">
                  {/* Sub-col izquierda: dashboard, statistics, informacion */}
                  <div className="flex-1 flex flex-col gap-2.5">
                    {MODULES.filter((_, i) => i % 2 === 0).map(mod => <ModuleCard key={mod.key} mod={mod} perms={perms} toggleModule={toggleModule} toggleSub={toggleSub} />)}
                  </div>
                  {/* Sub-col derecha: orders, company, settings */}
                  <div className="flex-1 flex flex-col gap-2.5">
                    {MODULES.filter((_, i) => i % 2 === 1).map(mod => <ModuleCard key={mod.key} mod={mod} perms={perms} toggleModule={toggleModule} toggleSub={toggleSub} />)}
                  </div>
                </div>
              </div>

              {/* Columna derecha: Camiones + Comisión + Empresas */}
              <div className="w-72 p-5 overflow-y-auto flex flex-col gap-5 shrink-0">

                {/* Comisión — solo dispatchers */}
                {permUser.user_metadata?.role === 'dispatcher' && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Comisión</p>
                    <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
                      <label className="block text-xs text-gray-400 mb-2">
                        {new Date().toLocaleDateString('es-US', { month: 'long', year: 'numeric' })}
                      </label>
                      <div className="flex items-center gap-2 mb-4">
                        <input
                          type="number"
                          min="0" max="100" step="0.5"
                          value={dispatcherRate}
                          onChange={e => setDispatcherRate(e.target.value)}
                          placeholder="0"
                          className="w-20 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500 text-center"
                        />
                        <span className="text-gray-400 text-sm">%</span>
                      </div>
                      {rateHistory.length > 0 && (
                        <>
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-2">Historial</p>
                          <div className="space-y-1">
                            {[...rateHistory].reverse().slice(0, 8).map(r => (
                              <div key={r.month} className="flex items-center justify-between">
                                <span className="text-[11px] text-gray-500 capitalize">{formatMonth(r.month)}</span>
                                <span className="text-[11px] font-semibold text-gray-300">{r.pct}%</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Camiones */}
                {permUser.user_metadata?.role !== 'super_admin' && dbTrucks.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Camiones asignados</p>
                    <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-3">
                      <div className="flex items-center gap-3 mb-3">
                        <button type="button" onClick={() => setAllowedTrucks(dbTrucks.map(t => t.id))}
                          className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors font-semibold">Todos</button>
                        <span className="text-gray-700 text-[10px]">·</span>
                        <button type="button" onClick={() => setAllowedTrucks([])}
                          className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors font-semibold">Ninguno</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                        {dbTrucks.map(t => {
                          const checked = allowedTrucks.includes(t.id)
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setAllowedTrucks(prev => checked ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
                                checked
                                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                              }`}
                            >
                              {checked && (
                                <svg className="w-3 h-3 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                              )}
                              #{t.number} {t.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Empresas */}
                {companies.length > 1 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Empresas</p>
                    <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-3 space-y-2">
                      {companies.map(c => {
                        const cName = c.company_info?.company_name || c.display_name || 'Sin nombre'
                        const checked = allowedCompanies.includes(c.id)
                        return (
                          <label key={c.id} className="flex items-center gap-3 cursor-pointer">
                            <div onClick={() => setAllowedCompanies(prev => checked ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${checked ? 'bg-orange-500' : 'bg-gray-700'}`}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
                            </div>
                            <span className={`text-xs ${checked ? 'text-gray-200' : 'text-gray-600'}`}>{cName}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-800 shrink-0 flex gap-3">
              <button onClick={() => setPermUser(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button onClick={savePermissions} disabled={savingPerms}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}>
                {savingPerms ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowModal(false); setResendUser(null) }} />
          <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">
                {modalMode === 'invite' ? 'Enviar Invitación' : 'Nuevo Usuario'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5 p-1 bg-gray-800 rounded-lg">
              {['create', 'invite'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setModalMode(mode)}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    modalMode === mode ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {mode === 'create' ? 'Crear Usuario' : 'Invitar por Email'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nombre completo"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/70"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/70"
                  required
                />
              </div>

              {modalMode === 'create' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Contraseña</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/70"
                    required
                    minLength={8}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Rol</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/70"
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="driver">Driver</option>
                  <option value="driver_lease">Driver LEASE</option>
                </select>
              </div>

              {modalMode === 'invite' && (
                <p className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-700">
                  El usuario recibirá un email con un link para crear su contraseña y acceder al sistema.
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 2px 12px rgba(234,88,12,0.3)' }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Procesando...
                  </span>
                ) : modalMode === 'invite' ? 'Enviar Invitación' : 'Crear Usuario'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
