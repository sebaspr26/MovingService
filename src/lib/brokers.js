// Broker matching across the many spellings the same company shows up with on
// rate confirmations ("AXL Logistics", "AXL LOGISTICS LLC", "Axl Logistics, Inc.").
// Exact-name matching created a new MC-less duplicate on almost every scan, so
// the MC# someone looked up and pasted for one load was lost on the next one.

const LEGAL_SUFFIXES = /\b(l\s*l\s*c|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pllc)\b/g

export function normalizeBrokerName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,'"()\-/]/g, ' ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const digits = v => String(v || '').replace(/[^0-9]/g, '')

/**
 * Finds the stored broker for a scanned/typed one: same MC#, then same DOT#,
 * then same normalized name. Among name matches (duplicates), prefers one that
 * already has an MC#. Returns null if nothing matches.
 */
export function findBrokerMatch(brokers, { name, mc_number, dot_number }) {
  const list = brokers || []
  const mc = digits(mc_number)
  if (mc) {
    const byMc = list.find(b => digits(b.mc_number) === mc)
    if (byMc) return byMc
  }
  const dot = digits(dot_number)
  if (dot) {
    const byDot = list.find(b => digits(b.dot_number) === dot)
    if (byDot) return byDot
  }
  const key = normalizeBrokerName(name)
  if (!key) return null
  const byName = list.filter(b => normalizeBrokerName(b.name) === key)
  return byName.find(b => digits(b.mc_number)) || byName[0] || null
}

/**
 * MC# already stored for this broker — on the broker itself or on a duplicate
 * with the same normalized name. '' if none is known.
 */
export function findStoredMc(brokers, broker) {
  if (!broker) return ''
  if (digits(broker.mc_number)) return broker.mc_number
  const key = normalizeBrokerName(broker.name)
  if (!key) return ''
  const sibling = (brokers || []).find(b => b.id !== broker.id && digits(b.mc_number) && normalizeBrokerName(b.name) === key)
  return sibling?.mc_number || ''
}

/**
 * MC# stored for this broker in ANY company. Brokers are per company, and the
 * same broker (RXO, AXL...) shows up in several of ours — the MC# looked up for
 * one company's load was invisible to the next company's. Only the MC# (public
 * FMCSA data) is reused, never the other company's broker record.
 * Resolves to '' if not found.
 */
export async function lookupStoredMcAnyCompany(supabase, name) {
  const key = normalizeBrokerName(name)
  const firstWord = key.split(' ')[0]
  if (!firstWord || firstWord.length < 2) return ''
  const { data } = await supabase.from('brokers').select('name, mc_number')
    .not('mc_number', 'is', null).neq('mc_number', '')
    .ilike('name', `%${firstWord}%`)
    .limit(200)
  const hit = (data || []).find(b => normalizeBrokerName(b.name) === key && digits(b.mc_number))
  return hit?.mc_number || ''
}
