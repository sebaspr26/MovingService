import { supabase } from './supabase'
import { logAudit } from './auditLog'

// Unions of dispatchers (supabase/037_dispatcher_unions.sql). Only the super
// admin creates/edits them; everybody else only sees them as one "dispatcher".
// Members are lower-case emails; a dispatcher belongs to at most one union.

export const normEmail = e => String(e || '').trim().toLowerCase()

/** The company's unions. Never throws: before the migration it's just []. */
export async function loadUnions(companyId) {
  const q = supabase.from('dispatcher_unions').select('*').order('created_at')
  const { data, error } = await (companyId ? q.eq('company_id', companyId) : q)
  if (error) {
    console.warn('[unions]', error.message)
    return []
  }
  return (data || []).map(u => ({ ...u, members: (u.members || []).map(normEmail) }))
}

export const unionOf = (unions, email) => unions.find(u => u.members.includes(normEmail(email))) || null

export async function createUnion(session, { companyId, name, members }) {
  const clean = [...new Set(members.map(normEmail).filter(Boolean))]
  const { data, error } = await supabase.from('dispatcher_unions')
    .insert({ company_id: companyId, name: name.trim(), members: clean }).select().single()
  if (error) throw error
  logAudit(session, { action: 'create_union', entityType: 'union', entityId: data.id, entityName: data.name, extraInfo: { members: clean } })
  return { ...data, members: clean }
}

/** `patch` can carry `name` and/or `members`. A union left with fewer than 2 members is dissolved. */
export async function updateUnion(session, union, patch) {
  const next = { ...patch }
  if (next.name !== undefined) next.name = next.name.trim()
  if (next.members) next.members = [...new Set(next.members.map(normEmail).filter(Boolean))]
  if (next.members && next.members.length < 2) {
    await deleteUnion(session, union)
    return null
  }
  const { data, error } = await supabase.from('dispatcher_unions').update(next).eq('id', union.id).select().single()
  if (error) throw error
  logAudit(session, {
    action: 'update_union', entityType: 'union', entityId: union.id, entityName: data.name,
    extraInfo: { before: { name: union.name, members: union.members }, after: { name: data.name, members: data.members } },
  })
  return { ...data, members: (data.members || []).map(normEmail) }
}

/** Dissolves the union. Payments already made keep working: they are plain per-dispatcher payments. */
export async function deleteUnion(session, union) {
  const { error } = await supabase.from('dispatcher_unions').delete().eq('id', union.id)
  if (error) throw error
  logAudit(session, { action: 'delete_union', entityType: 'union', entityId: union.id, entityName: union.name, extraInfo: { members: union.members } })
}
