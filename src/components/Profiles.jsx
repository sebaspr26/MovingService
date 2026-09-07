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

function CopyChip({ text, icon }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={handleCopy}
      title={`Copiar ${icon === 'phone' ? 'teléfono' : 'email'}`}
      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors group"
    >
      {icon === 'phone' ? (
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
        </svg>
      ) : (
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
      )}
      <span className="truncate max-w-[140px]">{copied ? '¡Copiado!' : text}</span>
    </button>
  )
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
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkingId, setLinkingId] = useState(null)
  const [permUser, setPermUser] = useState(null)
  const [perms, setPerms] = useState({})
  const [allowedCompanies, setAllowedCompanies] = useState([])
  const [allowedTrucks, setAllowedTrucks] = useState([])
  const [savingPerms, setSavingPerms] = useState(false)
  const [dispatcherRate, setDispatcherRate] = useState('')
  const [rateHistory, setRateHistory] = useState([])
  const [impersonateUser, setImpersonateUser] = useState(null)
  const [impersonateLink, setImpersonateLink] = useState(null)
  const [impersonateLoading, setImpersonateLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const toast = useToast()
  const { refreshSession, session } = useAuth()
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
        (() => { const cId = getActiveCompanyId(); const q = supabase.from('drivers').select('id, name, email, phone, status').order('name'); return cId ? q.eq('company_id', cId) : q })(),
        (() => { const cId = getActiveCompanyId(); const q = supabase.from('trucks').select('id, name, number').order('number'); return cId ? q.eq('company_id', cId) : q })(),
        (() => { const cId = getActiveCompanyId(); const q = supabase.from('orders').select('dispatcher').not('dispatcher', 'is', null).neq('dispatcher', ''); return cId ? q.eq('company_id', cId) : q })(),
      ])
      const usersData = await usersRes.json().catch(() => ({}))
      if (!usersRes.ok) throw new Error(usersData?.error || `Error ${usersRes.status}`)
      const activeCompanyId = getActiveCompanyId()
      const allSorted = (usersData.users || []).sort((a, b) =>
        rolePriority(a.user_metadata?.role) - rolePriority(b.user_metadata?.role)
      )
      // Filter: super_admin always visible; others must have activeCompanyId in allowed_companies
      const sorted = activeCompanyId
        ? allSorted.filter(u => {
            const role = u.user_metadata?.role
            if (role === 'super_admin') return true
            const ac = u.user_metadata?.allowed_companies
            return Array.isArray(ac) && ac.includes(activeCompanyId)
          })
        : allSorted
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

  async function handleImpersonate(user) {
    setImpersonateUser(user)
    setImpersonateLink(null)
    setCopied(false)
    setImpersonateLoading(true)
    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'impersonate', email: user.email }),
      })
      const data = await res.json()
      if (!res.ok || !data.link) throw new Error(data.error || 'Error generando link')
      setImpersonateLink(data.link)
    } catch (e) {
      toast.error(e.message)
      setImpersonateUser(null)
    } finally {
      setImpersonateLoading(false)
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
    const activeCompanyId = getActiveCompanyId()
    // Read per-company settings, fall back to legacy top-level
    const companyMeta = (activeCompanyId && user.user_metadata?.company_settings?.[activeCompanyId]) || {}
    const defaults = defaultPermissions()
    const existing = companyMeta.permissions || user.user_metadata?.permissions || {}
    const merged = {}
    for (const mod of MODULES) {
      merged[mod.key] = {
        ...defaults[mod.key],
        ...(existing[mod.key] || {}),
      }
    }
    setPerms(merged)
    // allowed_companies: global (which companies the user can access)
    const existingAllowed = user.user_metadata?.allowed_companies
    setAllowedCompanies(existingAllowed ?? companies.map(c => c.id))
    // allowed_trucks and dispatcher_rates are per-company
    const existingTrucks = companyMeta.allowed_trucks ?? user.user_metadata?.allowed_trucks
    setAllowedTrucks(existingTrucks ?? dbTrucks.map(t => t.id))
    const rates = companyMeta.dispatcher_rates || user.user_metadata?.dispatcher_rates || []
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
        body: JSON.stringify({ action: 'update_permissions', email: permUser.email, userId: permUser.id, permissions: perms, allowed_companies: allowedCompanies, allowed_trucks: allowedTrucks, dispatcher_rates: newRates, company_id: getActiveCompanyId() }),
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

  async function linkUser(user) {
    setLinkingId(user.id)
    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_to_company', userId: user.id, company_id: getActiveCompanyId() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
      toast.success(`${user.user_metadata?.name || user.email} vinculado a esta empresa`)
      setShowLinkModal(false)
      setLinkSearch('')
      fetchUsers()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLinkingId(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Perfiles de Usuario</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Gestiona los usuarios del sistema</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setLinkSearch(''); setShowLinkModal(true) }}
            className="p-2 sm:px-3 sm:py-2 rounded-lg border border-cyan-700/60 text-cyan-400 hover:bg-cyan-900/20 transition-colors flex items-center gap-1.5"
            title="Vincular usuario"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
            <span className="hidden sm:inline text-sm">Vincular</span>
          </button>
          <button
            onClick={() => openModal('invite')}
            className="p-2 sm:px-3 sm:py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-1.5"
            title="Enviar invitación"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
            <span className="hidden sm:inline text-sm">Invitar</span>
          </button>
          <button
            onClick={() => openModal('create')}
            className="p-2 sm:px-3 sm:py-2 rounded-lg text-white flex items-center gap-1.5 transition-colors"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 2px 12px rgba(234,88,12,0.3)' }}
            title="Nuevo usuario"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="hidden sm:inline text-sm font-semibold">Nuevo</span>
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
                        className={`p-3 sm:p-4 rounded-xl border bg-gray-900 hover:border-gray-700 transition-colors ${inactive ? 'border-gray-800/60 opacity-50 grayscale' : 'border-gray-800'}`}
                      >
                        {/* Row 1: Avatar + Name + Status */}
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden relative flex items-center justify-center text-sm font-bold text-white shrink-0"
                            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
                          >
                            {getInitials(name, user.email)}
                            {getUserAvatarUrl(user) && <img src={getUserAvatarUrl(user)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{name || user.email}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <CopyChip text={user.email} icon="email" />
                              {user.user_metadata?.phone && <CopyChip text={user.user_metadata.phone} icon="phone" />}
                            </div>
                          </div>
                          {/* Status dot (always visible) */}
                          {status === 'active' ? (
                            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Activo" />
                          ) : status === 'pending' ? (
                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" title="Solicitud enviada" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" title="Expirado" />
                          )}
                        </div>

                        {/* Row 2: Role select + Last access + Actions */}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <select
                            value={role}
                            onChange={e => handleUpdateRole(user.id, e.target.value)}
                            className={`sel text-xs px-2 py-0.5 rounded-full border font-medium bg-transparent cursor-pointer focus:outline-none ${roleConfig.color}`}
                          >
                            {Object.entries(ROLE_LABELS).map(([key, { label }]) => (
                              <option key={key} value={key} className="bg-gray-900 text-gray-200">{label}</option>
                            ))}
                          </select>

                          {/* Status label + resend on mobile */}
                          {status !== 'active' && (
                            <button
                              onClick={() => {
                                setResendUser(user)
                                setModalMode('invite')
                                setForm({ name: user.user_metadata?.name || '', email: user.email, password: '', role: user.user_metadata?.role || 'admin' })
                                setShowModal(true)
                              }}
                              className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${status === 'pending' ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30' : 'bg-orange-600/20 text-orange-400 hover:bg-orange-600/30'}`}
                            >
                              Reenviar
                            </button>
                          )}

                          <div className="hidden md:flex items-center gap-1 text-xs text-gray-500">
                            <span className="text-gray-700">·</span>
                            <span>{lastSignIn}</span>
                          </div>

                          <div className="flex items-center gap-1 ml-auto">
                            {/* Entrar como — solo super_admin, no en otros super_admin */}
                            {session?.user?.user_metadata?.role === 'super_admin' && role !== 'super_admin' && (
                              <button
                                onClick={() => handleImpersonate(user)}
                                className="p-1.5 rounded-lg text-cyan-600 hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors"
                                title="Entrar como este usuario"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                                </svg>
                              </button>
                            )}
                            {role !== 'super_admin' && (
                              <button
                                onClick={() => openPermissions(user)}
                                className="p-1.5 rounded-lg text-gray-600 hover:text-orange-400 hover:bg-orange-400/10 transition-colors"
                                title="Configurar permisos"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(user.id, user.email)}
                              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              title="Eliminar usuario"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Dispatchers from orders without Auth account */}
                  {unlinkedDispatchers.map(name => (
                    <div
                      key={`dispatcher-${name}`}
                      className="p-3 sm:p-4 rounded-xl border border-gray-800/60 bg-gray-900 hover:border-gray-700 transition-colors opacity-50 grayscale"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                          style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                        >
                          {getInitials(name, '')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Registrado en órdenes</p>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-gray-500 shrink-0" title="Sin cuenta" />
                      </div>
                      <div className="flex items-center gap-2 mt-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_LABELS.dispatcher.color}`}>
                          {ROLE_LABELS.dispatcher.label}
                        </span>
                        <button
                          onClick={() => {
                            setModalMode('invite')
                            setForm({ name, email: '', password: '', role: 'dispatcher' })
                            setShowModal(true)
                          }}
                          className="ml-auto px-2 py-0.5 text-xs rounded-md bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 transition-colors font-medium"
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
                      className="p-3 sm:p-4 rounded-xl border border-gray-800/60 bg-gray-900 hover:border-gray-700 transition-colors opacity-50 grayscale"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                          style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                        >
                          {getInitials(driver.name, driver.email)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{driver.name}</p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{driver.email || driver.phone || 'Sin contacto registrado'}</p>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-gray-500 shrink-0" title="Sin cuenta" />
                      </div>
                      <div className="flex items-center gap-2 mt-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_LABELS.driver.color}`}>
                          {ROLE_LABELS.driver.label}
                        </span>
                        {driver.email && (
                          <button
                            onClick={() => {
                              setModalMode('invite')
                              setForm({ name: driver.name, email: driver.email, password: '', role: 'driver' })
                              setShowModal(true)
                            }}
                            className="ml-auto px-2 py-0.5 text-xs rounded-md bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 transition-colors font-medium"
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

            {/* Body — 2 cols on desktop, stacked on mobile */}
            <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden min-h-0">

              {/* Columna izquierda: Permisos */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto md:border-r border-b md:border-b-0 border-gray-800">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Módulos y permisos</p>
                {(permUser.user_metadata?.role === 'driver' || permUser.user_metadata?.role === 'driver_lease') ? (
                  /* Drivers: solo Dashboard y Ordenes, acceso automático */
                  <div className="space-y-3">
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                      </svg>
                      <p className="text-[11px] text-orange-300/80">Los conductores acceden automáticamente a su camión y sus órdenes. No requieren configuración de módulos.</p>
                    </div>
                    <div className="flex gap-2.5">
                      {MODULES.filter(m => m.key === 'dashboard' || m.key === 'orders').map(mod => {
                        const isLease = permUser.user_metadata?.role === 'driver_lease'
                        const driverSubs = mod.subs.filter(s => {
                          if (s.adminOnly) return false
                          if (s.key === 'ver_gastos_propietario' && !isLease) return false
                          return s.driverOnly || !s.adminOnly
                        })
                        return (
                          <div key={mod.key} className="flex-1 rounded-xl border border-gray-700 bg-gray-800/50 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <svg className="w-3.5 h-3.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={mod.icon} />
                              </svg>
                              <span className="text-xs font-bold text-white">{mod.label}</span>
                              <span className="text-[10px] text-orange-400/70 ml-auto">Auto</span>
                            </div>
                            {driverSubs.length > 0 && (
                              <div className="border-t border-gray-700/40 pt-2 space-y-1">
                                {driverSubs.map(sub => {
                                  const subEnabled = perms[mod.key]?.[sub.key] !== false
                                  return (
                                    <button key={sub.key} onClick={() => toggleSub(mod.key, sub.key)}
                                      className="w-full flex items-center justify-between py-0.5 gap-2">
                                      <span className={`text-[11px] text-left leading-tight ${subEnabled ? 'text-gray-300' : 'text-gray-600'}`}>{sub.label}</span>
                                      <div className={`w-7 h-3.5 rounded-full relative shrink-0 transition-colors ${subEnabled ? 'bg-orange-500/80' : 'bg-gray-700'}`}>
                                        <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${subEnabled ? 'left-3.5' : 'left-0.5'}`} />
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  /* Resto de roles: grid completo */
                  <div className="flex gap-2.5">
                    <div className="flex-1 flex flex-col gap-2.5">
                      {MODULES.filter((_, i) => i % 2 === 0).map(mod => <ModuleCard key={mod.key} mod={mod} perms={perms} toggleModule={toggleModule} toggleSub={toggleSub} />)}
                    </div>
                    <div className="flex-1 flex flex-col gap-2.5">
                      {MODULES.filter((_, i) => i % 2 === 1).map(mod => <ModuleCard key={mod.key} mod={mod} perms={perms} toggleModule={toggleModule} toggleSub={toggleSub} />)}
                    </div>
                  </div>
                )}
              </div>

              {/* Columna derecha: Camiones + Comisión + Empresas */}
              <div className="w-full md:w-72 p-4 sm:p-5 overflow-y-auto flex flex-col gap-5 md:shrink-0">

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
                    </div>
                  </div>
                )}

                {/* Camiones — oculto para drivers (su camión es automático) */}
                {permUser.user_metadata?.role !== 'super_admin' && permUser.user_metadata?.role !== 'driver' && permUser.user_metadata?.role !== 'driver_lease' && dbTrucks.length > 0 && (
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
                  className="sel w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/70"
                >
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

      {showLinkModal && (
        <LinkUserModal
          activeCompanyId={getActiveCompanyId()}
          onLink={linkUser}
          linkingId={linkingId}
          onClose={() => setShowLinkModal(false)}
        />
      )}

      {/* Modal — Entrar como usuario */}
      {impersonateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setImpersonateUser(null); setImpersonateLink(null) }} />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden"
            style={{ background: 'rgba(10,10,18,0.97)', backdropFilter: 'blur(32px)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}
          >
            {/* Header con gradiente sutil */}
            <div className="relative px-6 pt-6 pb-5 border-b border-gray-800/60">
              <button
                onClick={() => { setImpersonateUser(null); setImpersonateLink(null) }}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Avatar grande */}
              <div className="flex flex-col items-center text-center gap-3">
                <div
                  className="w-16 h-16 rounded-2xl overflow-hidden relative flex items-center justify-center text-xl font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 8px 24px rgba(234,88,12,0.35)' }}
                >
                  {getInitials(impersonateUser.user_metadata?.name, impersonateUser.email)}
                  {getUserAvatarUrl(impersonateUser) && (
                    <img src={getUserAvatarUrl(impersonateUser)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </div>
                <div>
                  <p className="text-base font-bold text-white">{impersonateUser.user_metadata?.name || impersonateUser.email}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{impersonateUser.email}</p>
                  <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full border font-medium ${ROLE_LABELS[impersonateUser.user_metadata?.role]?.color || 'text-gray-400 bg-gray-400/10 border-gray-400/20'}`}>
                    {ROLE_LABELS[impersonateUser.user_metadata?.role]?.label || impersonateUser.user_metadata?.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Instrucción */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <svg className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                <p className="text-xs text-cyan-300/80 leading-relaxed">
                  Se generará un link de acceso válido por <strong>1 hora</strong>. Ábrelo en una <strong>ventana de incógnito</strong> para no cerrar tu sesión actual.
                </p>
              </div>

              {/* Link generado */}
              {impersonateLink ? (
                <div className="space-y-3">
                  <div
                    className="rounded-xl p-3 flex items-center gap-2"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 1 1.242 7.244" />
                    </svg>
                    <span className="text-xs text-gray-400 truncate flex-1">Link de acceso generado</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(impersonateLink)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2500)
                      }}
                      className={`shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${copied ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                    >
                      {copied ? (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          Copiado
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                          </svg>
                          Copiar
                        </>
                      )}
                    </button>
                  </div>

                  <a
                    href={impersonateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)', boxShadow: '0 4px 20px rgba(8,145,178,0.35)' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    Abrir en nueva pestaña
                  </a>

                  <p className="text-center text-[11px] text-gray-600">
                    Usa <span className="text-gray-500 font-medium">Ctrl+Shift+N</span> (incógnito) para no cerrar tu sesión
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => handleImpersonate(impersonateUser)}
                  disabled={impersonateLoading}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)', boxShadow: '0 4px 20px rgba(8,145,178,0.3)' }}
                >
                  {impersonateLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generando link...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                      </svg>
                      Generar link de acceso
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LinkUserModal({ activeCompanyId, onLink, linkingId, onClose }) {
  const [allUsers, setAllUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/invite-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })
      .then(r => r.json())
      .then(data => {
        const outside = (data.users || []).filter(u => {
          if (u.user_metadata?.role === 'super_admin') return false
          const ac = u.user_metadata?.allowed_companies
          return !Array.isArray(ac) || !ac.includes(activeCompanyId)
        })
        setAllUsers(outside)
      })
      .catch(() => setAllUsers([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = allUsers.filter(u => {
    const name = (u.user_metadata?.name || '').toLowerCase()
    const email = (u.email || '').toLowerCase()
    const q = search.toLowerCase()
    return !q || name.includes(q) || email.includes(q)
  })

  const ROLE_COLORS = { admin: 'text-blue-400', dispatcher: 'text-purple-400', driver: 'text-cyan-400', driver_lease: 'text-green-400' }
  const ROLE_LABELS = { admin: 'Admin', dispatcher: 'Dispatcher', driver: 'Driver', driver_lease: 'Driver LEASE' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
            <h2 className="text-base font-bold text-white">Vincular usuario existente</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 pt-4 pb-3 border-b border-gray-800">
          <p className="text-xs text-gray-500 mb-3">Agrega un usuario que ya tiene cuenta en otra empresa. No se le enviará ningún correo.</p>
          <input
            autoFocus
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="px-6 py-3 max-h-72 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">{allUsers.length === 0 ? 'Todos los usuarios ya están en esta empresa' : 'Sin resultados'}</p>
          ) : filtered.map(u => {
            const meta = u.user_metadata || {}
            const name = meta.name || u.email || ''
            const role = meta.role || 'dispatcher'
            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const companiesCount = (meta.allowed_companies || []).length
            return (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-800 hover:border-gray-700 transition-colors">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)' }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight truncate">{name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium ${ROLE_COLORS[role] || 'text-gray-400'}`}>{ROLE_LABELS[role] || role}</span>
                    {companiesCount > 0 && <span className="text-[10px] text-gray-600">{companiesCount} empresa{companiesCount !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <button
                  onClick={() => onLink(u)}
                  disabled={!!linkingId}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                  style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)' }}
                >
                  {linkingId === u.id
                    ? <span className="flex items-center gap-1"><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />Vinculando</span>
                    : 'Vincular'}
                </button>
              </div>
            )
          })}
        </div>

        <div className="px-6 py-3 border-t border-gray-800">
          <p className="text-[10px] text-gray-600 text-center">Los permisos en esta empresa se configuran por separado desde el modal de permisos</p>
        </div>
      </div>
    </div>
  )
}
