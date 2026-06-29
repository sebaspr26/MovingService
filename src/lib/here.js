const API_KEY = import.meta.env.VITE_HERE_API_KEY

/**
 * Geocode an address/city string to { lat, lng }
 * Returns null if not found.
 */
export async function geocode(query) {
  if (!query || !query.trim()) return null
  const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(query)}&in=countryCode:USA&apiKey=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (!data.items || data.items.length === 0) return null
  const pos = data.items[0].position
  return { lat: pos.lat, lng: pos.lng, label: data.items[0].address?.label || query }
}

/**
 * Calculate truck route between two points.
 * Returns { distanceMiles, durationMinutes, polyline } or null.
 * Uses HERE Routing v8 with truck transport mode.
 */
export async function calculateTruckRoute(origin, destination) {
  if (!origin || !destination) return null

  // Geocode if strings
  const from = typeof origin === 'string' ? await geocode(origin) : origin
  const to = typeof destination === 'string' ? await geocode(destination) : destination
  if (!from || !to) return null

  const url = `https://router.hereapi.com/v8/routes?transportMode=truck&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&return=summary,polyline&apiKey=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()

  if (!data.routes || data.routes.length === 0) return null
  const route = data.routes[0]
  const section = route.sections[0]

  return {
    distanceMiles: Math.round(section.summary.length / 1609.344),
    durationMinutes: Math.round(section.summary.duration / 60),
    polyline: section.polyline,
    origin: from,
    destination: to,
  }
}

/**
 * Calculate route with multiple stops (waypoints).
 * stops: array of { city, state } or strings
 * Returns { totalMiles, totalMinutes, legs: [...], polylines: [...] } or null
 */
export async function calculateMultiStopRoute(stops) {
  if (!stops || stops.length < 2) return null

  // Build location strings
  const locations = stops.map(s => {
    if (typeof s === 'string') return s
    return [s.city, s.state].filter(Boolean).join(', ')
  }).filter(Boolean)

  if (locations.length < 2) return null

  // Geocode all
  const coords = await Promise.all(locations.map(l => geocode(l)))
  if (coords.some(c => !c)) return null

  // Build route request with via points
  const origin = `${coords[0].lat},${coords[0].lng}`
  const destination = `${coords[coords.length - 1].lat},${coords[coords.length - 1].lng}`
  const vias = coords.slice(1, -1).map(c => `&via=${c.lat},${c.lng}`).join('')

  const url = `https://router.hereapi.com/v8/routes?transportMode=truck&origin=${origin}&destination=${destination}${vias}&return=summary,polyline&apiKey=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()

  if (!data.routes || data.routes.length === 0) return null
  const route = data.routes[0]

  const legs = route.sections.map((s, i) => ({
    distanceMiles: Math.round(s.summary.length / 1609.344),
    durationMinutes: Math.round(s.summary.duration / 60),
    polyline: s.polyline,
  }))

  return {
    totalMiles: legs.reduce((sum, l) => sum + l.distanceMiles, 0),
    totalMinutes: legs.reduce((sum, l) => sum + l.durationMinutes, 0),
    legs,
    coords,
  }
}

/**
 * Decode HERE flexible polyline to array of [lat, lng] pairs.
 * Uses the flexible-polyline algorithm.
 */
export function decodePolyline(encoded) {
  const result = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    // Decode header on first iteration (skip it)
    if (result.length === 0 && index === 0) {
      // HERE flexible polyline: first decode header
      // Header: precision, third_dim, third_dim_precision
      let b, shift, value

      // Decode precision
      b = decodeChar(encoded[index++])
      // precision is in bits 0-3 of first value
      // Skip header bytes
      while (b >= 32 && index < encoded.length) {
        b = decodeChar(encoded[index++])
      }
    }

    let b, shift, delta

    // lat
    shift = 0; delta = 0
    do {
      if (index >= encoded.length) break
      b = decodeChar(encoded[index++])
      delta |= (b & 0x1F) << shift
      shift += 5
    } while (b >= 32)
    lat += (delta & 1) ? ~(delta >> 1) : (delta >> 1)

    // lng
    shift = 0; delta = 0
    do {
      if (index >= encoded.length) break
      b = decodeChar(encoded[index++])
      delta |= (b & 0x1F) << shift
      shift += 5
    } while (b >= 32)
    lng += (delta & 1) ? ~(delta >> 1) : (delta >> 1)

    result.push([lat / 1e5, lng / 1e5])
  }

  return result
}

function decodeChar(c) {
  const code = c.charCodeAt(0)
  if (code >= 63 && code <= 126) return code - 63
  return 0
}

/**
 * Format duration in minutes to human readable
 */
export function formatDuration(minutes) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}
