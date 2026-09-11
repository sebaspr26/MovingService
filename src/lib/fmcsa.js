const API_URL = '/api/fmcsa-lookup'
const FMCSA_KEY = import.meta.env.VITE_FMCSA_KEY
const BASE_URL = 'https://mobile.fmcsa.dot.gov/qc/services'

/**
 * Search carrier/broker by DOT number
 */
export async function lookupByDot(dotNumber) {
  if (!dotNumber) return null
  // Try proxy first (works from any location via Vercel US servers)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'dot', value: dotNumber }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.result) return data.result
    }
  } catch {}
  // Fallback: direct call (only works from US)
  return fetchCarrier(`${BASE_URL}/carriers/${dotNumber}?webKey=${FMCSA_KEY}`)
}

/**
 * Search carrier/broker by MC/MX number
 */
export async function lookupByMc(mcNumber) {
  if (!mcNumber) return null
  const num = String(mcNumber).replace(/^(MC|MX)-?\s*/i, '').trim()
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'mc', value: mcNumber }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.result) return data.result
    }
  } catch {}
  return fetchCarrier(`${BASE_URL}/carriers/docket-number/${num}?webKey=${FMCSA_KEY}`)
}

/**
 * Search carriers by name (partial match)
 */
export async function searchByName(name) {
  if (!name || name.length < 3) return []
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'name', value: name }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.results && data.results.length > 0) return data.results
    }
  } catch {}
  // Fallback: direct call
  try {
    const url = `${BASE_URL}/carriers/name/${encodeURIComponent(name)}?webKey=${FMCSA_KEY}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const items = data.content || []
    return items.slice(0, 10).map(i => parseCarrier(i.carrier)).filter(Boolean)
  } catch {
    return []
  }
}

async function fetchCarrier(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const carrier = data.content?.carrier || data.content?.[0]?.carrier
    if (!carrier) return null
    return parseCarrier(carrier)
  } catch {
    return null
  }
}

function parseCarrier(c) {
  if (!c) return null
  return {
    name: c.legalName || c.dbaName || '',
    dba: c.dbaName || '',
    dot_number: String(c.dotNumber || ''),
    mc_number: c.mcNumber ? String(c.mcNumber) : '',
    phone: c.telephone || '',
    address: [c.phyStreet, c.phyCity, c.phyState, c.phyZipcode].filter(Boolean).join(', '),
    city: c.phyCity || '',
    state: c.phyState || '',
    zip: c.phyZipcode || '',
    status: c.allowedToOperate === 'Y' ? 'Authorized' : 'Not Authorized',
    entity_type: c.carrierOperation?.carrierOperationDesc || '',
    total_drivers: c.totalDrivers || 0,
    total_power_units: c.totalPowerUnits || 0,
  }
}
