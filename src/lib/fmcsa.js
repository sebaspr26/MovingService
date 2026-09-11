const API_URL = '/api/fmcsa-lookup'

/**
 * Search carrier/broker by DOT number (via Vercel proxy)
 */
export async function lookupByDot(dotNumber) {
  if (!dotNumber) return null
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'dot', value: dotNumber }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.result || null
  } catch {
    return null
  }
}

/**
 * Search carrier/broker by MC/MX number (via Vercel proxy)
 */
export async function lookupByMc(mcNumber) {
  if (!mcNumber) return null
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'mc', value: mcNumber }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.result || null
  } catch {
    return null
  }
}

/**
 * Search carriers by name (via Vercel proxy)
 */
export async function searchByName(name) {
  if (!name || name.length < 3) return []
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'name', value: name }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.results || []
  } catch {
    return []
  }
}

/**
 * Search by name and pick the best match: an exact name match if present,
 * otherwise the largest carrier (most power units + drivers) among results.
 * The name-search endpoint never includes the MC number, so once a carrier
 * is identified, its own (FMCSA-verified) DOT number is used to fetch the
 * MC via the docket-numbers lookup.
 */
export async function findBestMatchByName(name) {
  const results = await searchByName(name)
  if (results.length === 0) return null
  const exact = results.find(r => r.name.toLowerCase() === name.toLowerCase())
  const match = exact || results.sort((a, b) => (b.total_power_units + b.total_drivers) - (a.total_power_units + a.total_drivers))[0]

  if (!match.mc_number && match.dot_number) {
    const dotMatch = await lookupByDot(match.dot_number)
    if (dotMatch?.mc_number) match.mc_number = dotMatch.mc_number
  }

  return match
}
