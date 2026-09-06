import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { isSuperAdmin } from '../lib/permissions'

function expiryBadge(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const now = new Date()
  const daysLeft = Math.floor((date - now) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0)
    return { bg: 'bg-red-900/40 text-red-400 border-red-800/50', label: 'Vencido' }
  if (daysLeft < 60)
    return { bg: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50', label: `${daysLeft}d` }
  return { bg: 'bg-green-900/30 text-green-400 border-green-800/40', label: `${daysLeft}d` }
}

function fmt_date(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

export default function DispatcherDrivers() {
  const { session } = useAuth()
  const [drivers, setDrivers] = useState([])
  const [trucks, setTrucks] = useState({})
  const [loading, setLoading] = useState(true)

  const role = session?.user?.user_metadata?.role
  const isAdmin = isSuperAdmin(session) || role === 'admin'
  const userEmail = session?.user?.email

  // Esperar a que la sesión cargue antes de fetch (evita queries con email=undefined)
  useEffect(() => {
    if (session === undefined) return
    fetchData()
  }, [session?.user?.id])

  async function fetchData() {
    setLoading(true)

    let allowedTruckIds = null // null = todos

    if (!isAdmin) {
      // Dispatcher: obtener truck_ids de sus ordenes
      const { data: orders } = await supabase
        .from('orders')
        .select('truck_id')
        .eq('dispatcher', userEmail)
        .not('truck_id', 'is', null)
      allowedTruckIds = [...new Set((orders || []).map(o => o.truck_id))]
    }

    // Fetch trucks
    let trucksData = []
    if (allowedTruckIds === null) {
      const { data } = await supabase.from('trucks').select('id, name, number, vin_number').order('name')
      trucksData = data || []
    } else if (allowedTruckIds.length > 0) {
      const { data } = await supabase.from('trucks').select('id, name, number, vin_number').in('id', allowedTruckIds).order('name')
      trucksData = data || []
    }

    const trucksMap = {}
    trucksData.forEach(t => { trucksMap[t.id] = t })
    setTrucks(trucksMap)

    // Fetch drivers
    let driversData = []
    if (allowedTruckIds === null) {
      const { data } = await supabase.from('drivers').select('*').eq('status', 'active').order('name')
      driversData = data || []
    } else if (allowedTruckIds.length > 0) {
      const { data } = await supabase.from('drivers').select('*').in('truck_id', allowedTruckIds).eq('status', 'active').order('name')
      driversData = data || []
    }

    setDrivers(driversData)
    setLoading(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Conductores</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? 'Todos los conductores activos' : 'Conductores de tus órdenes asignadas'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <svg className="w-12 h-12 text-gray-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          <p className="text-gray-500 text-sm">No hay conductores asignados a tus órdenes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map(driver => {
            const truck = trucks[driver.truck_id]
            const licBadge = expiryBadge(driver.license_expiry)
            const medBadge = expiryBadge(driver.medical_card_expiry)
            return (
              <div key={driver.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">

                {/* Header: nombre + truck */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white text-sm leading-tight">{driver.name}</p>
                    {truck && (
                      <p className="text-xs text-orange-400 mt-0.5">
                        {truck.name} #{truck.number}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800/40 shrink-0">
                    Activo
                  </span>
                </div>

                {/* Info grid */}
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
                      <p className="text-gray-200 font-mono">{driver.license_number} {driver.license_state && <span className="text-gray-500">({driver.license_state})</span>}</p>
                    </div>
                  )}
                  {truck?.vin_number && (
                    <div className="col-span-2">
                      <p className="text-gray-500 mb-0.5">VIN</p>
                      <p className="text-gray-200 font-mono text-[11px] break-all">{truck.vin_number}</p>
                    </div>
                  )}
                </div>

                {/* Expiry badges */}
                {(driver.license_expiry || driver.medical_card_expiry) && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-800">
                    {driver.license_expiry && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">CDL exp:</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${licBadge?.bg || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {fmt_date(driver.license_expiry)}
                          {licBadge && <span className="ml-1 opacity-80">({licBadge.label})</span>}
                        </span>
                      </div>
                    )}
                    {driver.medical_card_expiry && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">Med:</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${medBadge?.bg || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {fmt_date(driver.medical_card_expiry)}
                          {medBadge && <span className="ml-1 opacity-80">({medBadge.label})</span>}
                        </span>
                      </div>
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
