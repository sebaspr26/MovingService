const FMCSA_KEY = process.env.VITE_FMCSA_KEY
const BASE_URL = 'https://mobile.fmcsa.dot.gov/qc/services'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { type, value } = req.body || {}
  if (!type || !value) return res.status(400).json({ error: 'Missing type or value' })
  if (!FMCSA_KEY) return res.status(500).json({ error: 'FMCSA key not configured' })

  try {
    let url
    if (type === 'dot') {
      url = `${BASE_URL}/carriers/${value}?webKey=${FMCSA_KEY}`
    } else if (type === 'mc') {
      const num = String(value).replace(/^(MC|MX)-?\s*/i, '').trim()
      url = `${BASE_URL}/carriers/docket-number/${num}?webKey=${FMCSA_KEY}`
    } else if (type === 'name') {
      url = `${BASE_URL}/carriers/name/${encodeURIComponent(value)}?webKey=${FMCSA_KEY}`
    } else {
      return res.status(400).json({ error: 'Invalid type' })
    }

    const response = await fetch(url)
    if (!response.ok) return res.status(200).json({ results: [] })

    const data = await response.json()

    if (type === 'name') {
      const items = (data.content || []).slice(0, 10).map(i => parseCarrier(i.carrier))
      return res.status(200).json({ results: items.filter(Boolean) })
    }

    const carrier = data.content?.carrier || data.content?.[0]?.carrier
    if (!carrier) return res.status(200).json({ result: null })
    return res.status(200).json({ result: parseCarrier(carrier) })
  } catch (err) {
    console.error('[FMCSA proxy]', err)
    return res.status(200).json({ result: null, results: [] })
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
