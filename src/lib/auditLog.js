import { supabase } from './supabase'
import { getActiveCompanyId } from './company'

/**
 * Registra una entrada inmutable en audit_log. Nunca lanza — un fallo de
 * logging no debe bloquear la accion que lo origino.
 */
export async function logAudit(session, { action, entityType, entityId, entityName, extraInfo }) {
  try {
    const user = session?.user
    await supabase.from('audit_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      entity_name: entityName || null,
      company_id: getActiveCompanyId() || null,
      user_id: user?.id || null,
      user_email: user?.email || null,
      user_name: user?.user_metadata?.name || null,
      extra_info: extraInfo || null,
    })
  } catch (err) {
    console.warn('[audit log]', err)
  }
}

/** Diff superficial entre dos objetos planos — solo incluye campos que cambiaron. */
export function diffFields(before, after, fields) {
  const changes = {}
  for (const f of fields) {
    const a = before?.[f] ?? null
    const b = after?.[f] ?? null
    if (a !== b) changes[f] = { from: a, to: b }
  }
  return changes
}
