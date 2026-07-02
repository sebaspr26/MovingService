export const STATUS_CONFIG = {
  booked:     { label: 'Reservada',   color: 'blue',    bg: 'bg-blue-600/30',    text: 'text-blue-300',    border: 'border-blue-500/60' },
  assigned:   { label: 'Asignada',    color: 'yellow',  bg: 'bg-yellow-600/30',  text: 'text-yellow-300',  border: 'border-yellow-500/60' },
  in_transit: { label: 'En Transito', color: 'orange',  bg: 'bg-orange-600/30',  text: 'text-orange-300',  border: 'border-orange-500/60' },
  delivered:  { label: 'Entregada',   color: 'cyan',    bg: 'bg-cyan-600/30',    text: 'text-cyan-300',    border: 'border-cyan-500/60' },
  invoiced:   { label: 'Facturada',   color: 'green',   bg: 'bg-emerald-600/30', text: 'text-emerald-300', border: 'border-emerald-500/60' },
  paid:       { label: 'Pagado',      color: 'violet',  bg: 'bg-violet-600/30',  text: 'text-violet-300',  border: 'border-violet-500/60' },
  tonu:       { label: 'TONU',        color: 'red',     bg: 'bg-red-600/30',     text: 'text-red-300',     border: 'border-red-500/60' },
  canceled:   { label: 'Cancelada',   color: 'gray',    bg: 'bg-gray-700/40',    text: 'text-gray-400',    border: 'border-gray-600/50' },
}

// Main flow (progress bar)
export const STATUS_ORDER = ['booked', 'assigned', 'in_transit', 'delivered', 'invoiced', 'paid']

// All statuses including terminal ones (for dropdowns)
export const ALL_STATUSES = ['booked', 'assigned', 'in_transit', 'delivered', 'invoiced', 'paid', 'tonu', 'canceled']

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
    if (isTerminalStatus(o.status) || o.status === 'paid' || o.status === 'invoiced' || o.status === 'delivered' || o.status === 'booked') return o

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
