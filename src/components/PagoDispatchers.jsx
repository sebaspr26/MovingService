import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getActiveCompanyId } from '../lib/company'
import DispatcherPaymentModal from './DispatcherPaymentModal'

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
  const [dispatchers, setDispatchers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const activeCompanyId = getActiveCompanyId()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      // Auth users con rol dispatcher/admin/super_admin
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      })
      const data = await res.json()
      const allUsers = (data.users || []).filter(u =>
        ['dispatcher', 'admin', 'super_admin'].includes(u.user_metadata?.role)
      )
      // Dispatchers únicos de órdenes filtrados por empresa — fuente de verdad
      const ordersQ = supabase.from('orders').select('dispatcher').not('dispatcher', 'is', null).neq('dispatcher', '')
      const { data: orders } = activeCompanyId ? await ordersQ.eq('company_id', activeCompanyId) : await ordersQ

      const uniqueFromOrders = [...new Set((orders || []).map(o => o.dispatcher?.trim()).filter(Boolean))]

      // Solo incluir Auth users que hayan despachado en esta empresa
      const authUsers = allUsers.filter(u => {
        const email = u.email?.toLowerCase()
        return email && uniqueFromOrders.some(d => d.toLowerCase() === email)
      })
      const authEmails = new Set(authUsers.map(u => u.email?.toLowerCase()))

      // Legacy: los que aparecen en órdenes pero no tienen cuenta Auth
      const legacyEntries = uniqueFromOrders
        .filter(d => !authEmails.has(d.toLowerCase()))
        .map(d => ({ id: `legacy_${d}`, email: d, isLegacy: true }))

      setDispatchers([...authUsers, ...legacyEntries])
    } catch {}
    setLoading(false)
  }

  const filtered = dispatchers.filter(u => {
    const name = u.user_metadata?.name || u.email || ''
    const email = u.email || ''
    return !search || name.toLowerCase().includes(search.toLowerCase()) || email.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Pago Dispatchers</h1>
          <p className="text-sm text-gray-500 mt-1">{dispatchers.length} dispatcher{dispatchers.length !== 1 ? 's' : ''} registrados</p>
        </div>
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500 w-48"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500 text-sm">No hay dispatchers</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(user => {
            const meta = user.user_metadata || {}
            const role = meta.role || 'dispatcher'
            const name = meta.name || user.email || ''
            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const companyMeta = (activeCompanyId && meta.company_settings?.[activeCompanyId]) || {}
            const allRates = companyMeta.dispatcher_rates || []
            const currentRate = allRates.slice(-1)[0]

            return (
              <div
                key={user.id}
                onClick={() => !user.isLegacy && setSelectedUser(user)}
                className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors ${user.isLegacy ? 'border-gray-800/50 opacity-70' : 'border-gray-800 hover:border-orange-600/50 cursor-pointer hover:bg-gray-900/80'}`}
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
                        style={{ background: user.isLegacy ? 'linear-gradient(135deg, #374151, #1f2937)' : 'linear-gradient(135deg, #ea580c, #c2410c)' }}
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
                  ) : (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${ROLE_COLORS[role] || ROLE_COLORS.dispatcher}`}>
                      {ROLE_LABELS[role] || role}
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
      )}

      {selectedUser && (
        <DispatcherPaymentModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  )
}
