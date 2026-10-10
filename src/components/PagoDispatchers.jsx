import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCompanyId } from '../lib/company'
import DispatcherPaymentModal from './DispatcherPaymentModal'
import UnionPaymentModal from './UnionPaymentModal'
import { useToast } from './Toast'
import { loadUnions, createUnion, updateUnion, deleteUnion, unionOf, normEmail } from '../lib/dispatcherUnions'
import { useAuth } from '../context/AuthContext'
import { isSuperAdmin } from '../lib/permissions'
import { readPageCache, usePageCacheSave, loadAuthUsers } from '../lib/pageCache'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  dispatcher: 'Dispatcher',
}

const ROLE_COLORS = {
  super_admin: 'bg-orange-900/30 text-orange-400 border-orange-800/40',
  admin: 'bg-blue-900/30 text-blue-400 border-blue-800/40',
  dispatcher: 'bg-purple-900/30 text-purple-400 border-purple-800/40',
}

export default function PagoDispatchers() {
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // Last list right away; fetchData refreshes it in the background
  const cached = readPageCache('pago-dispatchers', session)
  const [dispatchers, setDispatchers] = useState(cached?.dispatchers || [])
  const [loading, setLoading] = useState(!cached)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [highlightPaymentNumber, setHighlightPaymentNumber] = useState(null)
  const [highlightOrderId, setHighlightOrderId] = useState(null)
  const activeCompanyId = getActiveCompanyId()
  const toast = useToast()
  const superAdmin = isSuperAdmin(session)

  // Uniones: el super admin las crea/edita; los demas solo ven la union como si
  // fuera un dispatcher (ver lib/dispatcherUnions.js y UnionPaymentModal)
  const [unions, setUnions] = useState([])
  const [unionsLoaded, setUnionsLoaded] = useState(false)
  const [selectedUnion, setSelectedUnion] = useState(null)
  const [separated, setSeparated] = useState(false)   // super admin: ver cada dispatcher por separado
  const [unionMode, setUnionMode] = useState(false)   // super admin: arrastrar para unir
  const [dragEmail, setDragEmail] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [unionForm, setUnionForm] = useState(null)    // { name, members: [email], union? } crear/editar
  const united = !(superAdmin && separated)

  useEffect(() => { fetchData() }, [])

  // Atajos solo para el super admin (con e.code para que Option en Mac no cambie la tecla):
  //   Alt+Shift+V  ver los dispatchers separados / unidos
  //   Alt+Shift+U  modo union: arrastrar un dispatcher sobre otro para unirlos
  useEffect(() => {
    if (!superAdmin) return
    function onKey(e) {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return
      if (e.code === 'KeyV') { e.preventDefault(); setSeparated(v => !v) }
      if (e.code === 'KeyU') { e.preventDefault(); setUnionMode(v => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [superAdmin])
  usePageCacheSave('pago-dispatchers', session, { dispatchers }, !loading)

  // Llegada desde el badge "#N" en Ordenes: abrir el modal de ese dispatcher
  // (o el de su union, si la ve unida) y resaltar el pago + la orden especifica
  useEffect(() => {
    const target = location.state?.dispatcherEmail
    if (!target || dispatchers.length === 0 || !unionsLoaded) return
    const union = united ? unionOf(unions, target) : null
    if (union) {
      setSelectedUnion(union)
      setHighlightOrderId(location.state?.orderId || null)
    } else {
      const match = dispatchers.find(u => u.email?.toLowerCase() === target.toLowerCase())
      if (match) {
        setSelectedUser(match)
        setHighlightPaymentNumber(location.state?.paymentNumber || null)
        setHighlightOrderId(location.state?.orderId || null)
      }
    }
    // Limpia el state para que no se re-dispare en navegaciones posteriores
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchers, unionsLoaded])

  async function fetchData() {
    if (!cached) setLoading(true)
    try {
      // Auth users (dispatcher/admin/super_admin) and the dispatchers of the
      // company's orders — the source of truth — at the same time
      const ordersQ = supabase.from('orders').select('dispatcher').not('dispatcher', 'is', null).neq('dispatcher', '')
      const [data, { data: orders }, unionRows] = await Promise.all([
        loadAuthUsers(),
        activeCompanyId ? ordersQ.eq('company_id', activeCompanyId) : ordersQ,
        loadUnions(activeCompanyId),
      ])
      setUnions(unionRows)
      setUnionsLoaded(true)
      const allUsers = (data.users || []).filter(u =>
        ['dispatcher', 'admin', 'super_admin'].includes(u.user_metadata?.role)
      )

      const uniqueFromOrders = [...new Set((orders || []).map(o => o.dispatcher?.trim()).filter(Boolean))]

      // Auth users asignados a esta empresa (via allowed_companies) — filtro estricto
      const authUsers = allUsers.filter(u => {
        if (!u.email) return false
        if (!activeCompanyId) return true
        const allowedCompanies = u.user_metadata?.allowed_companies
        if (!Array.isArray(allowedCompanies) || allowedCompanies.length === 0) return false
        return allowedCompanies.includes(activeCompanyId)
      })
      const authEmails = new Set(authUsers.map(u => u.email?.toLowerCase()))

      // Legacy: aparecen en órdenes pero sin cuenta Auth
      const legacyEntries = uniqueFromOrders
        .filter(d => !authEmails.has(d.toLowerCase()))
        .map(d => ({ id: `legacy_${d}`, email: d, isLegacy: true }))

      const visibleAuthUsers = isSuperAdmin(session)
        ? authUsers
        : authUsers.filter(u => u.user_metadata?.role !== 'super_admin')
      setDispatchers([...visibleAuthUsers, ...legacyEntries])
    } catch { setUnionsLoaded(true) }
    setLoading(false)
  }

  const isActivatedUser = u => {
    const m = u.user_metadata || {}
    return m.needs_password === false || (m.needs_password == null && !!(u.confirmed_at || u.email_confirmed_at || u.last_sign_in_at))
  }
  const userByEmail = useMemo(() => Object.fromEntries(dispatchers.filter(u => u.email).map(u => [normEmail(u.email), u])), [dispatchers])
  const nameOfEmail = email => userByEmail[normEmail(email)]?.user_metadata?.name || email
  // Quienes se pueden unir: cuentas activas que aun no estan en una union
  const freeUsers = dispatchers.filter(u => !u.isLegacy && isActivatedUser(u) && !unionOf(unions, u.email))

  const q = search.toLowerCase()
  const filtered = dispatchers.filter(u => {
    // Unidos: el dispatcher queda dentro de su union y no se ve por separado
    if (united && unionOf(unions, u.email)) return false
    const name = u.user_metadata?.name || u.email || ''
    const email = u.email || ''
    return !search || name.toLowerCase().includes(q) || email.toLowerCase().includes(q)
  })
  // Solo el super admin puede buscar una union por el nombre de sus miembros
  const unionCards = united ? unions.filter(un =>
    !search || un.name.toLowerCase().includes(q) || (superAdmin && un.members.some(m => m.includes(q) || nameOfEmail(m).toLowerCase().includes(q)))
  ) : []
  const memberUsersOf = union => union.members.map(m => userByEmail[m] || { id: `stub_${m}`, email: m, user_metadata: {} })

  async function runUnionAction(fn, okMsg) {
    try {
      await fn()
      if (okMsg) toast.success(okMsg)
      setUnions(await loadUnions(activeCompanyId))
    } catch (e) {
      toast.error('Error: ' + e.message)
    }
  }

  function handleDropOnUser(target) {
    const dragged = userByEmail[dragEmail]
    setDragEmail(null); setDropTarget(null)
    if (!dragged || !target || normEmail(target.email) === dragEmail) return
    if (unionOf(unions, dragged.email) || unionOf(unions, target.email)) {
      return toast.warning('Ese dispatcher ya esta en una union. Quitalo primero desde la tabla de Uniones.')
    }
    setUnionForm({ name: '', members: [normEmail(dragged.email), normEmail(target.email)] })
  }

  async function handleDropOnUnion(union) {
    const dragged = userByEmail[dragEmail]
    setDragEmail(null); setDropTarget(null)
    if (!dragged) return
    if (unionOf(unions, dragged.email)) return toast.warning('Ese dispatcher ya esta en una union.')
    const ok = await toast.confirm(`¿Agregar a ${dragged.user_metadata?.name || dragged.email} a la union "${union.name}"?`, { confirmText: 'Agregar', confirmClass: 'bg-orange-600 hover:bg-orange-500' })
    if (ok) runUnionAction(() => updateUnion(session, union, { members: [...union.members, normEmail(dragged.email)] }), 'Dispatcher agregado a la union')
  }

  async function saveUnionForm() {
    const { name, members, union } = unionForm
    if (!name.trim()) return toast.warning('Ponle un nombre a la union')
    if (!union && members.length < 2) return toast.warning('Selecciona al menos dos dispatchers')
    await runUnionAction(
      () => (union ? updateUnion(session, union, { name, members }) : createUnion(session, { companyId: activeCompanyId, name, members })),
      union ? 'Union actualizada' : 'Union creada',
    )
    setUnionForm(null)
  }

  async function removeMember(union, email) {
    const leaves = union.members.length <= 2
    const ok = await toast.confirm(
      leaves ? `Con solo 1 dispatcher la union "${union.name}" se deshace. ¿Continuar?` : `¿Sacar a ${nameOfEmail(email)} de la union "${union.name}"?`,
      { confirmText: leaves ? 'Deshacer union' : 'Sacar', confirmClass: 'bg-orange-600 hover:bg-orange-500' },
    )
    if (ok) runUnionAction(() => updateUnion(session, union, { members: union.members.filter(m => m !== email) }), leaves ? 'Union deshecha' : 'Dispatcher sacado de la union')
  }

  async function dissolveUnion(union) {
    const ok = await toast.confirm(`¿Deshacer la union "${union.name}"? Los pagos ya hechos se conservan; cada dispatcher vuelve a verse por separado.`, { confirmText: 'Deshacer' })
    if (ok) runUnionAction(() => deleteUnion(session, union), 'Union deshecha')
  }

  // Props de arrastre de una tarjeta de dispatcher (solo en modo union)
  const dragProps = user => unionMode && !user.isLegacy && isActivatedUser(user) ? {
    draggable: true,
    onDragStart: e => { setDragEmail(normEmail(user.email)); e.dataTransfer.effectAllowed = 'move' },
    onDragEnd: () => { setDragEmail(null); setDropTarget(null) },
    onDragOver: e => { if (dragEmail && dragEmail !== normEmail(user.email)) { e.preventDefault(); setDropTarget(`u:${user.id}`) } },
    onDragLeave: () => setDropTarget(t => (t === `u:${user.id}` ? null : t)),
    onDrop: e => { e.preventDefault(); handleDropOnUser(user) },
  } : {}

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Pago Dispatchers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{dispatchers.length} dispatcher{dispatchers.length !== 1 ? 's' : ''} registrados</p>
          {superAdmin && (
            <p className="text-[11px] text-gray-600 mt-1">
              <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-400">Alt+Shift+U</kbd> unir arrastrando
              <span className="mx-1.5">·</span>
              <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-400">Alt+Shift+V</kbd> ver {separated ? 'unidos' : 'separados'}
              {unionMode && <span className="ml-2 text-orange-400 font-semibold">Modo unión activo: arrastra un dispatcher sobre otro</span>}
              {separated && <span className="ml-2 text-blue-400 font-semibold">Vista separada</span>}
            </p>
          )}
        </div>
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500 w-full sm:w-48"
        />
      </div>

      {superAdmin && (
        <div className={`mb-6 bg-gray-900 border rounded-xl overflow-hidden ${unionMode ? 'border-orange-600/50' : 'border-gray-800'}`}>
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Uniones</h2>
              <span className="text-xs text-gray-600">{unions.length}</span>
            </div>
            <button
              onClick={() => setUnionForm({ name: '', members: [] })}
              className="text-xs font-medium text-blue-400 hover:text-orange-300 transition-colors"
            >+ Nueva unión</button>
          </div>
          {unions.length === 0 ? (
            <p className="px-4 pb-3 text-xs text-gray-600">Sin uniones. Une dos dispatchers para que los administradores los vean como uno solo.</p>
          ) : (
            <div className="divide-y divide-gray-800 border-t border-gray-800">
              {unions.map(un => {
                const addable = freeUsers
                return (
                  <div key={un.id} className="px-4 py-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate flex-1">{un.name}</p>
                      <button onClick={() => setUnionForm({ name: un.name, members: un.members, union: un })} title="Editar nombre" className="p-1 text-gray-500 hover:text-orange-400 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                      </button>
                      <button onClick={() => dissolveUnion(un)} title="Deshacer unión" className="p-1 text-gray-500 hover:text-red-400 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {un.members.map(m => (
                        <span key={m} className="inline-flex items-center gap-1 text-xs bg-gray-800 text-gray-300 rounded-full pl-2.5 pr-1 py-0.5">
                          {nameOfEmail(m)}
                          <button onClick={() => removeMember(un, m)} title="Sacar de la unión" className="w-4 h-4 rounded-full text-gray-500 hover:text-red-400 hover:bg-gray-700 flex items-center justify-center">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                          </button>
                        </span>
                      ))}
                      {addable.length > 0 && (
                        <select
                          value=""
                          onChange={e => e.target.value && runUnionAction(() => updateUnion(session, un, { members: [...un.members, normEmail(e.target.value)] }), 'Dispatcher agregado a la unión')}
                          className="text-xs bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5 text-gray-400 focus:outline-none focus:border-orange-500"
                        >
                          <option value="">+ Agregar</option>
                          {addable.map(u => <option key={u.id} value={u.email}>{u.user_metadata?.name || u.email}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 && unionCards.length === 0 ? (
        <div className="text-center py-20 text-gray-500 text-sm">No hay dispatchers</div>
      ) : (
        <div className="space-y-6">
        {unionCards.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Uniones</h2>
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-700">{unionCards.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {unionCards.map(un => (
                <div
                  key={un.id}
                  onClick={() => setSelectedUnion(un)}
                  onDragOver={e => { if (unionMode && dragEmail) { e.preventDefault(); setDropTarget(`n:${un.id}`) } }}
                  onDragLeave={() => setDropTarget(t => (t === `n:${un.id}` ? null : t))}
                  onDrop={e => { if (unionMode) { e.preventDefault(); handleDropOnUnion(un) } }}
                  className={`bg-gray-900 border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors hover:bg-gray-900/80 ${dropTarget === `n:${un.id}` ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-gray-800 hover:border-orange-600/50'}`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm leading-tight truncate">{un.name}</p>
                    {superAdmin && <p className="text-xs text-gray-500 truncate">{un.members.map(nameOfEmail).join(' + ')}</p>}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border shrink-0 bg-orange-900/30 text-orange-400 border-orange-800/40">Unión</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {[
          { key: 'super_admin', label: 'Super Admin' },
          { key: 'admin', label: 'Administradores' },
          { key: 'dispatcher', label: 'Dispatchers' },
        ].map(group => {
          const groupUsers = filtered.filter(u => (u.user_metadata?.role || 'dispatcher') === group.key)
          if (groupUsers.length === 0) return null
          return (
            <div key={group.key}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{group.label}</h2>
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-700">{groupUsers.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupUsers.map(user => {
            const meta = user.user_metadata || {}
            const role = meta.role || 'dispatcher'
            const name = meta.name || user.email || ''
            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const companyMeta = (activeCompanyId && meta.company_settings?.[activeCompanyId]) || {}
            const allRates = companyMeta.dispatcher_rates || []
            const currentRate = allRates.slice(-1)[0]
            const isActivated = meta.needs_password === false || (meta.needs_password == null && !!(user.confirmed_at || user.email_confirmed_at || user.last_sign_in_at))
            const inactive = user.isLegacy || !isActivated

            return (
              <div
                key={user.id}
                onClick={() => isActivated && !user.isLegacy && setSelectedUser(user)}
                {...dragProps(user)}
                className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors ${inactive ? 'border-gray-800/50 opacity-50 grayscale' : 'border-gray-800 hover:border-orange-600/50 cursor-pointer hover:bg-gray-900/80'} ${unionMode && !inactive ? 'cursor-grab' : ''} ${dropTarget === `u:${user.id}` ? '!border-orange-500 ring-2 ring-orange-500/50' : ''} ${dragEmail && dragEmail === normEmail(user.email) ? 'opacity-40' : ''}`}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  {(() => {
                    const avatarPath = meta.avatar_path
                    const avatarUrl = avatarPath
                      ? supabase.storage.from('company-docs').getPublicUrl(avatarPath).data?.publicUrl
                      : null
                    return (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden"
                        style={{ background: inactive ? 'linear-gradient(135deg, #374151, #1f2937)' : 'linear-gradient(135deg, #ea580c, #c2410c)' }}
                      >
                        {avatarUrl
                          ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                          : initials}
                      </div>
                    )
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm leading-tight truncate">{name}</p>
                    {!user.isLegacy && meta.name && (
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    )}
                  </div>
                  {user.isLegacy ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border shrink-0 bg-gray-800 text-gray-500 border-gray-700">
                      Sin cuenta
                    </span>
                  ) : !isActivated ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border shrink-0 bg-yellow-900/30 text-yellow-600 border-yellow-800/40">
                      Sin activar
                    </span>
                  ) : (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${ROLE_COLORS[role] || ROLE_COLORS.dispatcher}`}>
                      {ROLE_LABELS[role] || role}
                    </span>
                  )}
                  {!united && unionOf(unions, user.email) && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border shrink-0 bg-orange-900/30 text-orange-400 border-orange-800/40" title="Unión">
                      {unionOf(unions, user.email).name}
                    </span>
                  )}
                </div>

                {/* Comisión actual */}
                {currentRate && (
                  <div className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-400">Comisión actual</span>
                    <span className="text-sm font-bold text-orange-400">{currentRate.pct}%</span>
                  </div>
                )}

                {/* Historial de comisiones */}
                {allRates.length > 1 && (
                  <div className="text-[10px] text-gray-600">
                    Historial: {allRates.slice(-3).reverse().map(r => `${r.month}: ${r.pct}%`).join(' · ')}
                  </div>
                )}
              </div>
            )
          })}
              </div>
            </div>
          )
        })}
        </div>
      )}

      {selectedUnion && (
        <UnionPaymentModal
          union={selectedUnion}
          memberUsers={memberUsersOf(selectedUnion)}
          onClose={() => { setSelectedUnion(null); setHighlightOrderId(null) }}
          highlightOrderId={highlightOrderId}
        />
      )}

      {unionForm && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 animate-modal-backdrop" onClick={() => setUnionForm(null)}>
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md p-5 shadow-2xl animate-modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white mb-1">{unionForm.union ? 'Editar unión' : 'Nueva unión'}</h3>
            <p className="text-xs text-gray-500 mb-4">Los administradores verán esta unión como un solo dispatcher, con los pagos de todos juntos.</p>
            <label className="block text-xs font-medium text-gray-400 mb-1">Nombre de la unión</label>
            <input
              autoFocus
              value={unionForm.name}
              onChange={e => setUnionForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') saveUnionForm() }}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500 mb-4"
            />
            {!unionForm.union && (
              <>
                <p className="text-xs font-medium text-gray-400 mb-2">Dispatchers ({unionForm.members.length})</p>
                <div className="max-h-52 overflow-y-auto space-y-1 mb-4 border border-gray-800 rounded-lg p-1.5">
                  {[...freeUsers].map(u => {
                    const em = normEmail(u.email)
                    const on = unionForm.members.includes(em)
                    return (
                      <button key={u.id} onClick={() => setUnionForm(f => ({ ...f, members: on ? f.members.filter(x => x !== em) : [...f.members, em] }))}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors ${on ? 'bg-orange-600/10 text-white' : 'text-gray-400 hover:bg-gray-800/60'}`}>
                        <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${on ? 'bg-orange-600 border-orange-600' : 'border-gray-600'}`}>
                          {on && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>}
                        </span>
                        {u.user_metadata?.name || u.email}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setUnionForm(null)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={saveUnionForm} className="px-4 py-1.5 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-500 transition-colors">
                {unionForm.union ? 'Guardar' : 'Crear unión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <DispatcherPaymentModal
          user={selectedUser}
          onClose={() => { setSelectedUser(null); setHighlightPaymentNumber(null); setHighlightOrderId(null) }}
          highlightPaymentNumber={highlightPaymentNumber}
          highlightOrderId={highlightOrderId}
        />
      )}
    </div>
  )
}
