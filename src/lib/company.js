import { supabase } from './supabase'

// Cache por company_id
const cacheMap = {}

// Active company ID persisted in localStorage
const ACTIVE_KEY = 'active_company_id'

export function getActiveCompanyId() {
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActiveCompanyId(id) {
  localStorage.setItem(ACTIVE_KEY, id)
}

export async function getAllCompanies() {
  const { data } = await supabase
    .from('company_settings')
    .select('*')
    .order('created_at', { ascending: true })
  return data || []
}

export async function getCompanySettings(companyId) {
  const id = companyId || getActiveCompanyId()

  if (id && cacheMap[id]) return cacheMap[id]

  if (id) {
    const { data } = await supabase.from('company_settings').select('*').eq('id', id).maybeSingle()
    if (data) {
      cacheMap[id] = data
      return data
    }
  }

  // Fallback: get active company or first
  const { data } = await supabase
    .from('company_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (data) {
    cacheMap[data.id] = data
    if (!getActiveCompanyId()) setActiveCompanyId(data.id)
    return data
  }

  // Create default if none exists
  const { data: created } = await supabase.from('company_settings').insert({
    company_info: {}, billing_info: {}, remit_info: {}, display_name: 'Mi Empresa',
  }).select().single()
  if (created) {
    cacheMap[created.id] = created
    setActiveCompanyId(created.id)
  }
  return created
}

export async function createCompany(displayName, companyInfo = {}, billingInfo = {}, remitInfo = {}, logoPath = null) {
  const { data, error } = await supabase.from('company_settings').insert({
    display_name: displayName,
    company_info: companyInfo,
    billing_info: billingInfo,
    remit_info: remitInfo,
    logo_path: logoPath,
  }).select().single()
  if (error) throw error
  return data
}

export async function updateCompanyInfo(companyInfo, companyId) {
  const id = companyId || getActiveCompanyId()
  const settings = await getCompanySettings(id)
  const { data, error } = await supabase.from('company_settings')
    .update({ company_info: companyInfo, display_name: companyInfo.company_name || settings.display_name, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select().single()
  if (error) throw error
  cacheMap[settings.id] = data
  return data
}

export async function updateBillingInfo(billingInfo, remitInfo, companyId) {
  const id = companyId || getActiveCompanyId()
  const settings = await getCompanySettings(id)
  const { data, error } = await supabase.from('company_settings')
    .update({ billing_info: billingInfo, remit_info: remitInfo, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select().single()
  if (error) throw error
  cacheMap[settings.id] = data
  return data
}

export async function updateLogo(file, companyId) {
  const id = companyId || getActiveCompanyId()
  const settings = await getCompanySettings(id)
  if (settings.logo_path) {
    await supabase.storage.from('company-docs').remove([settings.logo_path])
  }
  const filePath = `company/${settings.id}/logo_${Date.now()}.${file.name.split('.').pop()}`
  const { error: uploadError } = await supabase.storage.from('company-docs').upload(filePath, file)
  if (uploadError) throw uploadError
  const { data, error } = await supabase.from('company_settings')
    .update({ logo_path: filePath, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select().single()
  if (error) throw error
  cacheMap[settings.id] = data
  return data
}

export async function removeLogo(companyId) {
  const id = companyId || getActiveCompanyId()
  const settings = await getCompanySettings(id)
  if (settings.logo_path) {
    await supabase.storage.from('company-docs').remove([settings.logo_path])
  }
  const { data, error } = await supabase.from('company_settings')
    .update({ logo_path: null, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select().single()
  if (error) throw error
  cacheMap[settings.id] = data
  return data
}

export function getLogoUrl(logoPath) {
  if (!logoPath) return '/logo-invoice.png'
  const { data } = supabase.storage.from('company-docs').getPublicUrl(logoPath)
  return data?.publicUrl || '/logo-invoice.png'
}

export function invalidateCache(companyId) {
  if (companyId) delete cacheMap[companyId]
  else Object.keys(cacheMap).forEach(k => delete cacheMap[k])
}
