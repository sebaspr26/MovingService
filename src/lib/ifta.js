import { supabase } from './supabase'
import { routeMilesByState } from './here'

// IFTA engine. Miles per state come from the HERE truck route of each order
// (there is no ELD/GPS): loaded = through the order's stops, empty (deadhead)
// = from the truck's previous delivery to this pickup. The route only gives
// the split between states; the totals are the miles recorded on the order
// (miles / dead_miles) when there are any, so IFTA matches the app's numbers.

const round1 = n => Math.round(n * 10) / 10

function scale(byState, target) {
  const total = Object.values(byState).reduce((s, v) => s + v, 0)
  if (!total) return {}
  const f = target > 0 ? target / total : 1
  return Object.fromEntries(Object.entries(byState).map(([st, mi]) => [st, round1(mi * f)]))
}

// Recorded miles are trusted unless they are far off the actual route (e.g. a
// deadhead of 839 mi for a ~100 mi drive): then the route distance is used and
// the order is flagged so someone checks it
const MIN_RATIO = 0.5
const MAX_RATIO = 1.6
function pickMiles(recorded, routeMiles) {
  if (!(recorded > 0)) return { miles: routeMiles, off: false }
  const ratio = recorded / routeMiles
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return { miles: routeMiles, off: true }
  return { miles: recorded, off: false }
}

function stopPlace(s) {
  return s.address || [s.city, s.state].filter(Boolean).join(', ')
}

/** Places the loaded route goes through: the stops in order, or PU -> DO. */
export function loadedPlaces(order, stops) {
  const fromStops = (stops || [])
    .filter(s => s.city || s.address)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map(stopPlace)
  if (fromStops.length >= 2) return fromStops
  return [order.pu_city, order.do_city].filter(Boolean)
}

/**
 * Inputs that determine an order's state miles. Stored with the result so a
 * later change (cities, stops, miles, previous delivery) triggers a recompute.
 */
export function stateMilesBasis(order, stops, prevDoCity) {
  return JSON.stringify([loadedPlaces(order, stops), prevDoCity || null, Number(order.miles) || 0, Number(order.dead_miles) || 0])
}

/**
 * { loaded: {ST: mi}, empty: {ST: mi}, basis } for one order, or null when the
 * route can't be resolved (e.g. a city HERE can't geocode).
 */
export async function computeOrderStateMiles(order, stops, prevDoCity) {
  const places = loadedPlaces(order, stops)
  const loadedRoute = await routeMilesByState(places)
  if (!loadedRoute) return null

  const warnings = []
  const loadedPick = pickMiles(Number(order.miles), loadedRoute.totalMiles)
  if (loadedPick.off) warnings.push(`Millas cargadas registradas (${order.miles}) muy distintas a la ruta (${Math.round(loadedRoute.totalMiles)})`)

  let empty = {}
  if (prevDoCity && places[0]) {
    const emptyRoute = await routeMilesByState([prevDoCity, places[0]])
    if (emptyRoute) {
      // No deadhead recorded: the route's own distance (the truck still drove it)
      const emptyPick = pickMiles(Number(order.dead_miles), emptyRoute.totalMiles)
      if (emptyPick.off) warnings.push(`Millas vacias registradas (${order.dead_miles}) muy distintas a la ruta desde ${prevDoCity} (${Math.round(emptyRoute.totalMiles)})`)
      empty = scale(emptyRoute.byState, emptyPick.miles)
    }
  }
  return {
    loaded: scale(loadedRoute.byState, loadedPick.miles),
    empty,
    warnings,
    basis: stateMilesBasis(order, stops, prevDoCity),
  }
}

// Orders that put miles on the truck: TONU and canceled loads never ran
const runs = o => o.truck_id && o.pu_date && !['canceled', 'tonu'].includes(o.status)

/**
 * Orders of `truckIds` picked up between `from` and `to` (YYYY-MM-DD), with
 * their stops and the previous delivery city of the same truck (start of the
 * deadhead). Each comes with `needsMiles` when state_miles is missing or stale.
 */
export async function loadIftaOrders(truckIds, from, to) {
  if (!truckIds.length) return []
  // Previous deliveries can be before the quarter — look back a bit
  const lookback = new Date(new Date(from).getTime() - 45 * 86400000).toISOString().slice(0, 10)
  const { data: orders, error } = await supabase.from('orders')
    .select('id, order_number, truck_id, status, pu_date, do_date, pu_city, do_city, miles, dead_miles, state_miles, state_miles_at')
    .in('truck_id', truckIds).gte('pu_date', lookback).lte('pu_date', to)
    .order('pu_date').order('do_date')
  if (error) throw error

  const inRange = (orders || []).filter(o => runs(o) && o.pu_date >= from)
  const ids = inRange.map(o => o.id)
  const stopsByOrder = {}
  for (let i = 0; i < ids.length; i += 200) {
    const { data: stops } = await supabase.from('order_stops')
      .select('order_id, type, address, city, state, sequence').in('order_id', ids.slice(i, i + 200))
    for (const s of stops || []) (stopsByOrder[s.order_id] ||= []).push(s)
  }

  const prevByTruck = {}
  const result = []
  for (const o of (orders || []).filter(runs)) {
    const prevDoCity = prevByTruck[o.truck_id] || null
    if (o.pu_date >= from) {
      const stops = stopsByOrder[o.id] || []
      const basis = stateMilesBasis(o, stops, prevDoCity)
      result.push({ ...o, stops, prevDoCity, needsMiles: o.state_miles?.basis !== basis })
    }
    if (o.do_city) prevByTruck[o.truck_id] = o.do_city
  }
  return result
}

/**
 * Computes and stores state miles for the orders that need them, a few at a
 * time. onProgress(done, total). Returns { done, failed: [order_number...] }.
 */
export async function fillStateMiles(orders, onProgress) {
  const pending = orders.filter(o => o.needsMiles)
  const failed = []
  let done = 0
  const CONCURRENCY = 3
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(pending.slice(i, i + CONCURRENCY).map(async o => {
      try {
        const sm = await computeOrderStateMiles(o, o.stops, o.prevDoCity)
        if (!sm) { failed.push(o.order_number); return }
        const { error } = await supabase.from('orders').update({ state_miles: sm, state_miles_at: new Date().toISOString() }).eq('id', o.id)
        if (error) { failed.push(o.order_number); return }
        o.state_miles = sm
        o.needsMiles = false
      } catch {
        failed.push(o.order_number)
      } finally {
        done++
        onProgress?.(done, pending.length)
      }
    }))
  }
  return { done, failed }
}
