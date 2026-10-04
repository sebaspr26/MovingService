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

// ── Quarter calculation ──────────────────────────────────────────────────────

const US_STATES = new Set('AL AZ AR CA CO CT DE FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '))

/** State of a fuel purchase from its city ("FORT PIERCE, FL" / "FORT PIERCE FL"). */
export function stateOfCity(city) {
  const m = String(city || '').trim().toUpperCase().match(/(?:^|[\s,])([A-Z]{2})\.?$/)
  return m && US_STATES.has(m[1]) ? m[1] : null
}

export function quarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1
  const pad = n => String(n).padStart(2, '0')
  const lastDay = new Date(year, startMonth + 2, 0).getDate()
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(startMonth + 2)}-${pad(lastDay)}` }
}

/**
 * Everything needed for one company's quarter: IFTA trucks, their orders (with
 * state miles status) and diesel purchases.
 */
export async function loadQuarterData(companyId, year, quarter) {
  const { from, to } = quarterRange(year, quarter)
  let tq = supabase.from('trucks').select('id, name, number').eq('ifta', true)
  if (companyId) tq = tq.eq('company_id', companyId)
  const { data: trucks, error } = await tq
  if (error) throw error
  const truckIds = (trucks || []).map(t => t.id)
  if (!truckIds.length) return { year, quarter, from, to, trucks: [], orders: [], diesel: [] }

  const [orders, dieselRes] = await Promise.all([
    loadIftaOrders(truckIds, from, to),
    supabase.from('diesel').select('id, truck_id, cycle_id, date, city, gallons, value, invoice_number, receipt_path')
      .in('truck_id', truckIds).gte('date', from).lte('date', to),
  ])
  return { year, quarter, from, to, trucks, orders, diesel: dieselRes.data || [] }
}

/**
 * The company's IFTA trucks with the active driver of each, for the
 * General / per-driver tabs: [{ id, name, number, driver }].
 */
export async function loadIftaFleet(companyId) {
  let tq = supabase.from('trucks').select('id, name, number').eq('ifta', true).order('name')
  if (companyId) tq = tq.eq('company_id', companyId)
  const { data: trucks } = await tq
  if (!trucks?.length) return []
  const { data: drivers } = await supabase.from('drivers').select('name, truck_id, status').in('truck_id', trucks.map(t => t.id))
  return trucks.map(t => ({ ...t, driver: (drivers || []).find(d => d.truck_id === t.id && d.status !== 'inactive')?.name || null }))
}

/** Same quarter data limited to one truck (null = the whole fleet). */
export function onlyTruck(data, truckId) {
  if (!truckId || !data) return data
  return {
    ...data,
    trucks: data.trucks.filter(t => t.id === truckId),
    orders: data.orders.filter(o => o.truck_id === truckId),
    diesel: data.diesel.filter(f => f.truck_id === truckId),
  }
}

const add = (obj, key, n) => { obj[key] = (obj[key] || 0) + n }

/**
 * IFTA math for a quarter (fleet-wide, like the official return):
 *   fleet MPG       = total miles / total gallons
 *   taxable gallons = miles in state / fleet MPG
 *   net tax         = (taxable - paid gallons bought in state) x rate
 *   surcharge (KY*, VA*) = taxable gallons x surcharge rate, no credit
 * Positive = owed to the state, negative = credit.
 */
export function computeQuarter(data, rates) {
  const milesByState = {}
  const milesByTruck = {}
  for (const o of data.orders) {
    if (!o.state_miles) continue
    for (const part of ['loaded', 'empty']) {
      for (const [st, mi] of Object.entries(o.state_miles[part] || {})) {
        add(milesByState, st, mi)
        add(milesByTruck, o.truck_id, mi)
      }
    }
  }

  const gallonsByState = {}
  const gallonsByTruck = {}
  const fuelIssues = []
  for (const f of data.diesel) {
    const gal = Number(f.gallons) || 0
    const st = stateOfCity(f.city)
    if (!gal || !st) {
      fuelIssues.push({ ...f, problem: !gal && !st ? 'Sin galones ni estado' : !gal ? 'Sin galones' : 'Sin estado' })
      if (!gal) continue
    }
    add(gallonsByTruck, f.truck_id, gal)
    if (st) add(gallonsByState, st, gal)
  }

  const totalMiles = Object.values(milesByState).reduce((s, v) => s + v, 0)
  const totalGallons = Object.values(gallonsByTruck).reduce((s, v) => s + v, 0)
  const mpg = totalGallons > 0 ? totalMiles / totalGallons : null

  const states = [...new Set([...Object.keys(milesByState), ...Object.keys(gallonsByState)])].sort()
  const rows = []
  for (const st of states) {
    const miles = milesByState[st] || 0
    const taxable = mpg ? miles / mpg : 0
    const paid = gallonsByState[st] || 0
    const rate = rates?.[st] ?? null
    const due = rate == null ? null : (taxable - paid) * rate
    rows.push({ state: st, miles, taxableGallons: taxable, paidGallons: paid, netGallons: taxable - paid, rate, due })
    const sur = rates?.[`${st}*`]
    if (sur) rows.push({ state: `${st}*`, surcharge: true, miles, taxableGallons: taxable, paidGallons: 0, netGallons: taxable, rate: sur, due: taxable * sur })
  }

  const pendingOrders = data.orders.filter(o => o.needsMiles)
  const warnings = data.orders.filter(o => o.state_miles?.warnings?.length)
  const totalDue = rows.reduce((s, r) => s + (r.due || 0), 0)
  return {
    totalMiles, totalGallons, mpg, rows, totalDue,
    milesByTruck, gallonsByTruck,
    pendingOrders, warnings, fuelIssues,
    missingRates: rows.filter(r => r.rate == null).map(r => r.state),
    ready: !pendingOrders.length && mpg != null && !!rates,
  }
}
