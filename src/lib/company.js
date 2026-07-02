import { supabase } from './supabase'

// Cache in memory to avoid repeated queries within same session
let cache = null

export async function getCompanySettings() {
  if (cache) return cache
  const { data } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
  if (data) {
    cache = data
    return data
  }
  // Create default row if none exists
  const { data: created } = await supabase.from('company_settings').insert({
    company_info: {}, billing_info: {}, remit_info: {},
  }).select().single()
  cache = created
  return created
}

export async function updateCompanyInfo(companyInfo) {
  const settings = await getCompanySettings()
  const { data, error } = await supabase.from('company_settings')
    .update({ company_info: companyInfo, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select().single()
  if (error) throw error
  cache = data
  return data
}

export async function updateBillingInfo(billingInfo, remitInfo) {
  const settings = await getCompanySettings()
  const { data, error } = await supabase.from('company_settings')
    .update({ billing_info: billingInfo, remit_info: remitInfo, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select().single()
  if (error) throw error
  cache = data
  return data
}

export async function updateLogo(file) {
  const settings = await getCompanySettings()
  // Remove old logo if exists
  if (settings.logo_path) {
    await supabase.storage.from('company-docs').remove([settings.logo_path])
  }
  const filePath = `company/logo_${Date.now()}.${file.name.split('.').pop()}`
  const { error: uploadError } = await supabase.storage.from('company-docs').upload(filePath, file)
  if (uploadError) throw uploadError
  const { data, error } = await supabase.from('company_settings')
    .update({ logo_path: filePath, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select().single()
  if (error) throw error
  cache = data
  return data
}

export async function removeLogo() {
  const settings = await getCompanySettings()
  if (settings.logo_path) {
    await supabase.storage.from('company-docs').remove([settings.logo_path])
  }
  const { data, error } = await supabase.from('company_settings')
    .update({ logo_path: null, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select().single()
  if (error) throw error
  cache = data
  return data
}

export function getLogoUrl(logoPath) {
  if (!logoPath) return '/logo-invoice.png'
  const { data } = supabase.storage.from('company-docs').getPublicUrl(logoPath)
  return data?.publicUrl || '/logo-invoice.png'
}

// Invalidate cache (call when settings change externally)
export function invalidateCache() {
  cache = null
}
