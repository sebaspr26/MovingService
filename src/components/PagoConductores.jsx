import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: driversData }, { data: trucksData }] = await Promise.all([
      supabase.from('drivers').select('*').order('name'),
      supabase.from('trucks').select('id, name, number, vin_number').order('name'),
    ])
    const trucksMap = {}
    ;(trucksData || []).forEach(t => { trucksMap[t.id] = t })
    setTrucks(trucksMap)
    setDrivers(driversData || [])
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
          <p className="text-sm text-gray-500 mt-1">{drivers.length} conductor{drivers.length !== 1 ? 'es' : ''} registrados</p>
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
            return (
              <div key={driver.id} className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 ${isActive ? 'border-gray-800' : 'border-gray-800/40 opacity-60'}`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white text-sm leading-tight">{driver.name}</p>
                    {truck && (
                      <p className="text-xs text-orange-400 mt-0.5">{truck.name} #{truck.number}</p>
                    )}
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
                  {truck?.vin_number && (
                    <div className="col-span-2">
                      <p className="text-gray-500 mb-0.5">VIN</p>
                      <p className="text-gray-200 font-mono text-[11px] break-all">{truck.vin_number}</p>
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
