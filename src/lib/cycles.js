import { supabase } from './supabase'

function fmt(d) { return d.toISOString().split('T')[0] }

/**
 * Compute dynamic weeks from startDate to endDate.
 * Week 1 = startDate to first Sunday.
 * Week 2+ = Monday to Sunday.
 * Only includes weeks that have started (up to today).
 */
export function computeWeeks(startDate, endDate, isClosed = false) {
  const start = new Date(startDate + 'T00:00:00')
  const end = endDate ? new Date(endDate + 'T00:00:00') : new Date()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Closed cycles show all weeks up to end_date; active cycles limit to today
  const limit = isClosed ? end : (end < today ? end : today)
  const weeks = []
  let current = new Date(start)

  while (current <= limit) {
    const weekStart = new Date(current)
    // Find next Sunday (day 0)
    let weekEnd = new Date(current)
    const daysToSun = (7 - weekEnd.getDay()) % 7
    if (daysToSun === 0 && weeks.length > 0) {
      // Already Sunday and not first week — move to next Sunday
      weekEnd.setDate(weekEnd.getDate() + 7)
    } else if (daysToSun === 0 && weekEnd.getDay() === 0) {
      // Start is Sunday — end of first week is this Sunday
    } else {
      weekEnd.setDate(weekEnd.getDate() + daysToSun)
    }

    // Clamp to cycle end
    if (endDate && weekEnd > end) weekEnd = new Date(end)

    // Only include if week has started
    if (weekStart > limit) break

    weeks.push({
      start: fmt(weekStart),
      end: fmt(weekEnd),
    })

    // Next week starts on Monday after this Sunday
    current = new Date(weekEnd)
    current.setDate(current.getDate() + 1)
  }

  return weeks
}

export async function getActiveCycle(truckId) {
  const { data } = await supabase.from('cycles').select('*')
    .eq('truck_id', truckId)
    .eq('closed', false)
    .is('end_date', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function getAllCycles(truckId) {
  const { data } = await supabase.from('cycles').select('*')
    .eq('truck_id', truckId)
    .order('start_date', { ascending: false })
  return data || []
}

export async function getLatestClosedCycle(truckId) {
  const { data } = await supabase.from('cycles').select('*')
    .eq('truck_id', truckId)
    .eq('closed', true)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function openCycle(truckId, startDate, previousBalance = 0) {
  const { data, error } = await supabase.from('cycles').insert({
    truck_id: truckId,
    start_date: startDate,
    end_date: null,
    previous_balance: previousBalance,
    cuadre_caja: 0,
    closed: false,
  }).select().single()
  if (error) throw error
  return data
}

export async function closeCycle(cycleId, cuadreCaja, endDate) {
  const { data, error } = await supabase.from('cycles').update({
    cuadre_caja: cuadreCaja,
    end_date: endDate,
    closed: true,
    closed_at: new Date().toISOString(),
  }).eq('id', cycleId).select().single()
  if (error) throw error
  return data
}

export async function getActiveCycleId(truckId) {
  const { data } = await supabase.from('cycles').select('id')
    .eq('truck_id', truckId)
    .eq('closed', false)
    .is('end_date', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

export async function reopenCycle(cycleId) {
  const { data, error } = await supabase.from('cycles').update({
    closed: false,
    end_date: null,
    closed_at: null,
  }).eq('id', cycleId).select().single()
  if (error) throw error
  return data
}
