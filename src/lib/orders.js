export const STATUS_CONFIG = {
  booked:     { label: 'Reservada',   color: 'blue',    bg: 'bg-blue-900/40',    text: 'text-blue-400',    border: 'border-blue-700/50' },
  assigned:   { label: 'Asignada',    color: 'yellow',  bg: 'bg-yellow-900/40',  text: 'text-yellow-400',  border: 'border-yellow-700/50' },
  in_transit: { label: 'En Transito', color: 'orange',  bg: 'bg-orange-900/40',  text: 'text-orange-400',  border: 'border-orange-700/50' },
  delivered:  { label: 'Entregada',   color: 'cyan',    bg: 'bg-cyan-900/40',    text: 'text-cyan-400',    border: 'border-cyan-700/50' },
  invoiced:   { label: 'Facturada',   color: 'green',   bg: 'bg-emerald-900/40', text: 'text-emerald-400', border: 'border-emerald-700/50' },
  tonu:       { label: 'TONU',        color: 'red',     bg: 'bg-red-900/40',     text: 'text-red-400',     border: 'border-red-700/50' },
  canceled:   { label: 'Cancelada',   color: 'gray',    bg: 'bg-gray-800/60',    text: 'text-gray-500',    border: 'border-gray-700/50' },
}

// Main flow (progress bar)
export const STATUS_ORDER = ['booked', 'assigned', 'in_transit', 'delivered', 'invoiced']

// All statuses including terminal ones (for dropdowns)
export const ALL_STATUSES = ['booked', 'assigned', 'in_transit', 'delivered', 'invoiced', 'tonu', 'canceled']

export const EQUIPMENT_TYPES = ['Dry Van', 'Flatbed', 'Reefer', 'Step Deck', 'Power Only', 'Hotshot']

export const LOAD_TYPES = ['FTL', 'LTL', 'Partial']

export function getNextStatus(current) {
  const idx = STATUS_ORDER.indexOf(current)
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) return null
  return STATUS_ORDER[idx + 1]
}

export function isTerminalStatus(status) {
  return status === 'tonu' || status === 'canceled'
}

export function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

/**
 * Auto-advance order statuses based on pickup/delivery dates.
 * - assigned + pickup date/time reached → in_transit
 * - in_transit + delivery date/time reached → delivered
 * Receives an array of orders, updates DB for changed ones, returns updated array.
 */
export async function autoAdvanceStatuses(orders, supabase) {
  const now = new Date()
  const updates = []

  const updated = orders.map(o => {
    if (isTerminalStatus(o.status) || o.status === 'invoiced' || o.status === 'delivered' || o.status === 'booked') return o

    const puDateTime = o.pu_date ? new Date(o.pu_date + 'T00:00:00') : null
    const doDateTime = o.do_date ? new Date(o.do_date + 'T23:59:59') : null

    let newStatus = null
    if (o.status === 'in_transit' && doDateTime && now >= doDateTime) {
      newStatus = 'delivered'
    } else if (o.status === 'assigned' && puDateTime && now >= puDateTime) {
      newStatus = 'in_transit'
    }

    if (newStatus) {
      updates.push({ id: o.id, status: newStatus })
      return { ...o, status: newStatus }
    }
    return o
  })

  // Batch update DB
  if (updates.length > 0) {
    await Promise.all(updates.map(u =>
      supabase.from('orders').update({ status: u.status }).eq('id', u.id)
    ))
  }

  return updated
}
