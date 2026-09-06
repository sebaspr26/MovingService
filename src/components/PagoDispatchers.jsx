import { useState, useEffect } from 'react'

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

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      })
      const data = await res.json()
      const users = data.users || []
      // Dispatchers + admins (pueden despachar)
      const filtered = users.filter(u => ['dispatcher', 'admin', 'super_admin'].includes(u.user_metadata?.role))
      setDispatchers(filtered)
    } catch {}
    setLoading(false)
  }

  const filtered = dispatchers.filter(u => {
    const name = u.user_metadata?.name || ''
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
            const name = meta.name || user.email
            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const currentRate = meta.dispatcher_rates?.slice(-1)[0]

            return (
              <div key={user.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm leading-tight truncate">{name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${ROLE_COLORS[role] || ROLE_COLORS.dispatcher}`}>
                    {ROLE_LABELS[role] || role}
                  </span>
                </div>

                {/* Comisión actual */}
                {currentRate && (
                  <div className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-400">Comisión actual</span>
                    <span className="text-sm font-bold text-orange-400">{currentRate.pct}%</span>
                  </div>
                )}

                {/* Historial de comisiones */}
                {meta.dispatcher_rates?.length > 1 && (
                  <div className="text-[10px] text-gray-600">
                    Historial: {meta.dispatcher_rates.slice(-3).reverse().map(r => `${r.month}: ${r.pct}%`).join(' · ')}
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
