// Truck type (supabase/038_truck_type.sql). null = "Sin elección": trucks created
// before the type existed. Only these three for now; new sections/features will
// hang from the type.
export const TRUCK_TYPES = [
  { value: 'box_truck', label: 'Box Truck', badge: 'bg-amber-900/30 text-amber-400 border-amber-800/40' },
  { value: 'dry_van', label: 'Dry Van', badge: 'bg-blue-900/30 text-blue-400 border-blue-800/40' },
  { value: 'reefer', label: 'Reefer', badge: 'bg-cyan-900/30 text-cyan-400 border-cyan-800/40' },
]

export const NO_TRUCK_TYPE_LABEL = 'Sin elección'

export const truckTypeInfo = type => TRUCK_TYPES.find(t => t.value === type) || null
export const truckTypeLabel = type => truckTypeInfo(type)?.label || NO_TRUCK_TYPE_LABEL
