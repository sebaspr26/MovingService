import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getActiveCompanyId } from '../lib/company'
import DriverPaymentModal from './DriverPaymentModal'

function expiryBadge(dateStr) {
  if (!dateStr) return null
  const daysLeft = Math.floor((new Date(dateStr) - new Date()) / 86400000)
  if (daysLeft < 0) return { bg: 'bg-red-900/40 text-red-400 border-red-800/50', label: 'Vencido' }
  if (daysLeft < 60) return { bg: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50', label: `${daysLeft}d` }
  return { bg: 'bg-green-900/30 text-green-400 border-green-800/40', label: `${daysLeft}d` }
}

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

export default function PagoConductores() {
  const [drivers, setDrivers] = useState([])
  const [trucks, setTrucks] = useState({})
  const [avatarMap, setAvatarMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDriver, setSelectedDriver] = useState(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: driversData }, { data: trucksData }, authRes] = await Promise.all([
      (() => { const q = supabase.from('drivers').select('*').order('name'); const cId = getActiveCompanyId(); return cId ? q.eq('company_id', cId) : q })(),
      supabase.from('trucks').select('id, name, number, vin_number, is_lis').order('name'),
      fetch('/api/invite-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) }).then(r => r.json()).catch(() => ({ users: [] })),
    ])
    const trucksMap = {}
    ;(trucksData || []).forEach(t => { trucksMap[t.id] = t })
    setTrucks(trucksMap)

    // Exclude drivers on LIS (lease) trucks
    const nonLisDrivers = (driversData || []).filter(d => {
      if (!d.truck_id) return true
      return !trucksMap[d.truck_id]?.is_lis
    })
    setDrivers(nonLisDrivers)

    const aMap = {}
    ;(authRes.users || []).forEach(u => {
      const path = u.user_metadata?.avatar_path
      if (u.email && path) {
        aMap[u.email.toLowerCase()] = supabase.storage.from('company-docs').getPublicUrl(path).data?.publicUrl
      }
    })
    setAvatarMap(aMap)
    setLoading(false)
  }

  const filtered = drivers.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) ||
    trucks[d.truck_id]?.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Pago Conductores</h1>
          <p className="text-sm text-gray-500 mt-1">{drivers.length} conductor{drivers.length !== 1 ? 'es' : ''} (excluye LIS/Lease)</p>
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
        <div className="text-center py-20 text-gray-500 text-sm">No hay conductores</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(driver => {
            const truck = trucks[driver.truck_id]
            const licBadge = expiryBadge(driver.license_expiry)
            const medBadge = expiryBadge(driver.medical_card_expiry)
            const isActive = driver.status === 'active'
            const initials = driver.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const avatarUrl = driver.email ? avatarMap[driver.email.toLowerCase()] : null
            return (
              <div
                key={driver.id}
                onClick={() => isActive && setSelectedDriver(driver)}
                className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-colors ${isActive ? 'border-gray-800 hover:border-cyan-600/50 cursor-pointer hover:bg-gray-900/80' : 'border-gray-800/40 opacity-60'}`}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden"
                    style={{ background: isActive ? 'linear-gradient(135deg, #0891b2, #0e7490)' : 'linear-gradient(135deg, #374151, #1f2937)' }}
                  >
                    {avatarUrl
                      ? <img src={avatarUrl} alt={driver.name} className="w-full h-full object-cover" />
                      : initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm leading-tight">{driver.name}</p>
                    {truck && <p className="text-xs text-orange-400 mt-0.5">{truck.name} #{truck.number}</p>}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${isActive ? 'bg-green-900/30 text-green-400 border-green-800/40' : 'bg-gray-800 text-gray-500 border-gray-700'}`}>
                    {isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Info */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {driver.phone && (
                    <div>
                      <p className="text-gray-500 mb-0.5">Teléfono</p>
                      <p className="text-gray-200">{driver.phone}</p>
                    </div>
                  )}
                  {driver.email && (
                    <div>
                      <p className="text-gray-500 mb-0.5">Email</p>
                      <p className="text-gray-200 truncate">{driver.email}</p>
                    </div>
                  )}
                  {driver.license_number && (
                    <div>
                      <p className="text-gray-500 mb-0.5">CDL #</p>
                      <p className="text-gray-200 font-mono">{driver.license_number}{driver.license_state ? ` (${driver.license_state})` : ''}</p>
                    </div>
                  )}
                </div>

                {/* Vencimientos */}
                {(driver.license_expiry || driver.medical_card_expiry) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
                    {driver.license_expiry && licBadge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${licBadge.bg}`}>
                        CDL {fmtDate(driver.license_expiry)} <span className="opacity-75">({licBadge.label})</span>
                      </span>
                    )}
                    {driver.medical_card_expiry && medBadge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${medBadge.bg}`}>
                        Med {fmtDate(driver.medical_card_expiry)} <span className="opacity-75">({medBadge.label})</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Click hint */}
                {isActive && (
                  <div className="pt-1 border-t border-gray-800 flex items-center justify-between">
                    <span className="text-[10px] text-gray-600">Click para gestionar pagos</span>
                    <svg className="w-3.5 h-3.5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedDriver && (
        <DriverPaymentModal
          driver={selectedDriver}
          truck={trucks[selectedDriver.truck_id] || null}
          onClose={() => setSelectedDriver(null)}
        />
      )}
    </div>
  )
}
