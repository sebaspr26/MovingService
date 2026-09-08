import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getActiveCompanyId } from '../lib/company'
import DriverPaymentModal from './DriverPaymentModal'


export default function PagoConductores() {
  const [drivers, setDrivers] = useState([])
  const [trucks, setTrucks] = useState({})
  const [avatarMap, setAvatarMap] = useState({})
  const [roleMap, setRoleMap] = useState({})
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

    // Include all drivers — LIS truck drivers go to LEASE section
    setDrivers(driversData || [])

    const aMap = {}
    const roleMap = {}
    ;(authRes.users || []).forEach(u => {
      const path = u.user_metadata?.avatar_path
      if (u.email) {
        if (path) aMap[u.email.toLowerCase()] = supabase.storage.from('company-docs').getPublicUrl(path).data?.publicUrl
        roleMap[u.email.toLowerCase()] = u.user_metadata?.role
      }
    })
    setAvatarMap(aMap)
    setRoleMap(roleMap)
    setLoading(false)
  }

  const filtered = drivers.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) ||
    trucks[d.truck_id]?.name?.toLowerCase().includes(search.toLowerCase())
  )
  const isLeaseDriver = d => d.is_lease || trucks[d.truck_id]?.is_lis || roleMap[d.email?.toLowerCase()] === 'driver_lease'
  const normalDrivers = filtered.filter(d => !isLeaseDriver(d))
  const leaseDrivers = filtered.filter(d => isLeaseDriver(d))

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Pago Conductores</h1>
          <p className="text-sm text-gray-500 mt-0.5">{normalDrivers.length} conductor{normalDrivers.length !== 1 ? 'es' : ''}{leaseDrivers.length > 0 ? ` · ${leaseDrivers.length} lease` : ''}</p>
        </div>
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500 w-full sm:w-48"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500 text-sm">No hay conductores</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {normalDrivers.map(driver => {
            const truck = trucks[driver.truck_id]
            const isActive = driver.status === 'active'
            const initials = driver.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const avatarUrl = driver.email ? avatarMap[driver.email.toLowerCase()] : null
            return (
              <div
                key={driver.id}
                onClick={() => isActive && setSelectedDriver(driver)}
                className={`bg-gray-900 border rounded-xl p-4 flex items-center gap-3 transition-colors ${isActive ? 'border-gray-800 hover:border-cyan-600/50 cursor-pointer hover:bg-gray-900/80' : 'border-gray-800/40 opacity-60'}`}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden"
                  style={{ background: isActive ? 'linear-gradient(135deg, #0891b2, #0e7490)' : 'linear-gradient(135deg, #374151, #1f2937)' }}>
                  {avatarUrl ? <img src={avatarUrl} alt={driver.name} className="w-full h-full object-cover" /> : initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm leading-tight">{driver.name}</p>
                  {truck && <p className="text-xs text-orange-400 mt-0.5">{truck.name} #{truck.number}</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${isActive ? 'bg-green-900/30 text-green-400 border-green-800/40' : 'bg-gray-800 text-gray-500 border-gray-700'}`}>
                  {isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            )
          })}
          </div>

          {leaseDrivers.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-bold text-green-500/80 uppercase tracking-widest">Lease</span>
                <div className="flex-1 h-px bg-green-900/30" />
                <span className="text-[10px] text-green-600">{leaseDrivers.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {leaseDrivers.map(driver => {
                const truck = trucks[driver.truck_id]
                const isActive = driver.status === 'active'
                const initials = driver.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                const avatarUrl = driver.email ? avatarMap[driver.email.toLowerCase()] : null
                return (
                  <div
                    key={driver.id}
                    onClick={() => isActive && setSelectedDriver(driver)}
                    className={`bg-gray-900 border rounded-xl p-4 flex items-center gap-3 transition-colors ring-1 ring-green-900/30 ${isActive ? 'border-green-900/40 hover:border-green-600/50 cursor-pointer hover:bg-gray-900/80' : 'border-gray-800/40 opacity-60'}`}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden"
                      style={{ background: isActive ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'linear-gradient(135deg, #374151, #1f2937)' }}>
                      {avatarUrl ? <img src={avatarUrl} alt={driver.name} className="w-full h-full object-cover" /> : initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm leading-tight">{driver.name}</p>
                      {truck && <p className="text-xs text-orange-400 mt-0.5">{truck.name} #{truck.number}</p>}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border shrink-0 bg-green-900/30 text-green-400 border-green-800/40 font-semibold">LEASE</span>
                  </div>
                )
              })}
              </div>
            </div>
          )}
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
