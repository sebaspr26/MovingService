import { useState, useEffect, useRef } from 'react'
import { useToast, friendlyError } from './Toast'
import { getCompanySettings, updateCompanyInfo, updateBillingInfo, updateLogo, removeLogo, getLogoUrl } from '../lib/company'

export default function Informacion() {
  const [tab, setTab] = useState('empresa')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Informaci&oacute;n</h1>
        <p className="text-sm text-gray-500 mt-1">Datos de la empresa y facturaci&oacute;n</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-0">
        <button
          onClick={() => setTab('empresa')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'empresa'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Empresa
        </button>
        <button
          onClick={() => setTab('billing')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'billing'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Billing
        </button>
      </div>

      {tab === 'empresa' && <FormCompanyInfo />}
      {tab === 'billing' && <FormBilling />}
    </div>
  )
}

function FormCompanyInfo() {
  const toast = useToast()
  const emptyForm = {
    company_name: '', dba: '', ein: '', mc_number: '', dot_number: '',
    address: '', city: '', state: '', zip: '', phone: '', email: '', website: '', founded: '',
  }
  const [savedForm, setSavedForm] = useState(emptyForm)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCompanySettings().then(s => {
      const info = { ...emptyForm, ...(s?.company_info || {}) }
      setSavedForm(info)
      setForm(info)
      setLoading(false)
    })
  }, [])

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSave() {
    try {
      await updateCompanyInfo(form)
      setSavedForm(form)
      toast.success('Informacion guardada')
    } catch (err) {
      toast.error(friendlyError(err.message))
    }
  }

  useEffect(() => {
    if (isDirty) {
      const timer = setTimeout(() => toast.warning('Tienes cambios sin guardar'), 5000)
      return () => clearTimeout(timer)
    }
  }, [isDirty])

  const inputClass = "w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"

  if (loading) return <div className="text-sm text-gray-500 py-4">Cargando...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">Esta info se muestra en el invoice y sidebar</p>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            isDirty ? 'bg-orange-600 text-white hover:bg-orange-500' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
          </svg>
          Guardar
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Company Name</label>
            <input value={form.company_name} onChange={e => update('company_name', e.target.value)} className={inputClass} placeholder="ETG Moving Services" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">DBA (Doing Business As)</label>
            <input value={form.dba} onChange={e => update('dba', e.target.value)} className={inputClass} placeholder="Driving Is Work LLC" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">EIN (Tax ID)</label>
            <input value={form.ein} onChange={e => update('ein', e.target.value)} className={inputClass} placeholder="XX-XXXXXXX" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Date Founded</label>
            <input type="date" value={form.founded} onChange={e => update('founded', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">MC Number</label>
            <input value={form.mc_number} onChange={e => update('mc_number', e.target.value)} className={inputClass} placeholder="MC-XXXXXXX" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">DOT Number</label>
            <input value={form.dot_number} onChange={e => update('dot_number', e.target.value)} className={inputClass} placeholder="XXXXXXX" />
          </div>
        </div>

        <hr className="border-gray-800" />
        <h3 className="text-sm font-medium text-gray-400">Address</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Street Address</label>
            <input value={form.address} onChange={e => update('address', e.target.value)} className={inputClass} placeholder="123 Main St" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">City</label>
            <input value={form.city} onChange={e => update('city', e.target.value)} className={inputClass} placeholder="Houston" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">State</label>
              <input value={form.state} onChange={e => update('state', e.target.value)} className={inputClass} placeholder="TX" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ZIP</label>
              <input value={form.zip} onChange={e => update('zip', e.target.value)} className={inputClass} placeholder="77001" />
            </div>
          </div>
        </div>

        <hr className="border-gray-800" />
        <h3 className="text-sm font-medium text-gray-400">Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Phone</label>
            <input value={form.phone} onChange={e => update('phone', e.target.value)} className={inputClass} placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={inputClass} placeholder="info@company.com" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Website</label>
            <input value={form.website} onChange={e => update('website', e.target.value)} className={inputClass} placeholder="www.company.com" />
          </div>
        </div>
      </div>
    </div>
  )
}

function FormBilling() {
  const toast = useToast()
  const emptyBilling = { billing_name: '', billing_address: '', billing_city: '', billing_state: '', billing_zip: '', billing_phone: '', billing_email: '' }
  const emptyRemit = { remit_name: '', remit_address: '', remit_city: '', remit_state: '', remit_zip: '', remit_email: '' }
  const [savedBilling, setSavedBilling] = useState(emptyBilling)
  const [savedRemit, setSavedRemit] = useState(emptyRemit)
  const [billing, setBilling] = useState(emptyBilling)
  const [remit, setRemit] = useState(emptyRemit)
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoChanged, setLogoChanged] = useState(false)
  const [logoFullscreen, setLogoFullscreen] = useState(false)
  const logoRef = useRef()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCompanySettings().then(s => {
      const b = { ...emptyBilling, ...(s?.billing_info || {}) }
      const r = { ...emptyRemit, ...(s?.remit_info || {}) }
      setSavedBilling(b); setBilling(b)
      setSavedRemit(r); setRemit(r)
      setLogoPreview(getLogoUrl(s?.logo_path))
      setLoading(false)
    })
  }, [])

  const isDirty = JSON.stringify(billing) !== JSON.stringify(savedBilling) || JSON.stringify(remit) !== JSON.stringify(savedRemit) || logoChanged
  const updateB = (field, value) => setBilling(prev => ({ ...prev, [field]: value }))
  const updateR = (field, value) => setRemit(prev => ({ ...prev, [field]: value }))

  async function handleSave() {
    try {
      await updateBillingInfo(billing, remit)
      setSavedBilling(billing)
      setSavedRemit(remit)
      setLogoChanged(false)
      toast.success('Billing guardado')
    } catch (err) {
      toast.error(friendlyError(err.message))
    }
  }

  useEffect(() => {
    if (isDirty) {
      const timer = setTimeout(() => toast.warning('Tienes cambios sin guardar'), 5000)
      return () => clearTimeout(timer)
    }
  }, [isDirty])

  const inputClass = "w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"

  if (loading) return <div className="text-sm text-gray-500 py-4">Cargando...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">Datos para facturacion y envio de invoices</p>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            isDirty ? 'bg-orange-600 text-white hover:bg-orange-500' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
          </svg>
          Guardar
        </button>
      </div>

      {/* Logo */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setLogoFullscreen(true)} className="w-12 h-12 rounded-full border-2 border-gray-700 overflow-hidden bg-gray-800 shrink-0 cursor-pointer hover:border-orange-500 transition-colors" title="Ver grande">
            <img src={logoPreview || '/logo-invoice.png'} alt="Logo" className="w-full h-full object-cover" />
          </button>
          <div>
            <h3 className="text-sm font-medium text-gray-400">Logo Invoice</h3>
            <p className="text-[10px] text-gray-600">Click para ver grande</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => logoRef.current?.click()} className="px-3 py-1.5 bg-orange-600/20 border border-orange-600/30 text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-600/30 transition-colors">
            Cambiar
          </button>
          {logoPreview && (
            <button onClick={async () => { await removeLogo(); setLogoPreview('/logo-invoice.png'); setLogoChanged(true) }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors">
              Reset
            </button>
          )}
        </div>
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const file = e.target.files[0]
          if (!file) return
          try {
            const updated = await updateLogo(file)
            setLogoPreview(getLogoUrl(updated.logo_path))
            setLogoChanged(true)
            toast.success('Logo actualizado')
          } catch (err) {
            toast.error(friendlyError(err.message))
          }
          e.target.value = ''
        }} />
      </div>

      {/* Bill From */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-400">Bill From</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Company / Name</label>
            <input value={billing.billing_name} onChange={e => updateB('billing_name', e.target.value)} className={inputClass} placeholder="Company name" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Address</label>
            <input value={billing.billing_address} onChange={e => updateB('billing_address', e.target.value)} className={inputClass} placeholder="Street address" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">City</label>
            <input value={billing.billing_city} onChange={e => updateB('billing_city', e.target.value)} className={inputClass} placeholder="City" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">State</label>
              <input value={billing.billing_state} onChange={e => updateB('billing_state', e.target.value)} className={inputClass} placeholder="TX" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ZIP</label>
              <input value={billing.billing_zip} onChange={e => updateB('billing_zip', e.target.value)} className={inputClass} placeholder="77001" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Phone</label>
            <input value={billing.billing_phone} onChange={e => updateB('billing_phone', e.target.value)} className={inputClass} placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input type="email" value={billing.billing_email} onChange={e => updateB('billing_email', e.target.value)} className={inputClass} placeholder="billing@company.com" />
          </div>
        </div>
      </div>

      {/* Remit To */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-400">Remit To</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Company / Name</label>
            <input value={remit.remit_name} onChange={e => updateR('remit_name', e.target.value)} className={inputClass} placeholder="Company name" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Address</label>
            <input value={remit.remit_address} onChange={e => updateR('remit_address', e.target.value)} className={inputClass} placeholder="Street address" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">City</label>
            <input value={remit.remit_city} onChange={e => updateR('remit_city', e.target.value)} className={inputClass} placeholder="City" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">State</label>
              <input value={remit.remit_state} onChange={e => updateR('remit_state', e.target.value)} className={inputClass} placeholder="TX" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ZIP</label>
              <input value={remit.remit_zip} onChange={e => updateR('remit_zip', e.target.value)} className={inputClass} placeholder="77001" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input type="email" value={remit.remit_email || ''} onChange={e => updateR('remit_email', e.target.value)} className={inputClass} placeholder="remit@company.com" />
          </div>
        </div>
      </div>

      {/* Logo fullscreen */}
      {logoFullscreen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8" onClick={() => setLogoFullscreen(false)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={logoPreview || '/logo-invoice.png'} alt="Logo" className="max-w-md max-h-[70vh] rounded-xl border border-gray-700 shadow-2xl" />
            <button onClick={() => setLogoFullscreen(false)} className="absolute -top-3 -right-3 w-7 h-7 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
