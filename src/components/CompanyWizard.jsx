import { useState } from 'react'
import { createCompany, updateLogo, getLogoUrl } from '../lib/company'
import { useCompany } from '../context/CompanyContext'
import { useToast } from './Toast'

const STEPS = [
  { id: 'info', label: 'Información', icon: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z' },
  { id: 'billing', label: 'Billing', icon: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z' },
  { id: 'logo', label: 'Logo', icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z' },
  { id: 'done', label: 'Listo', icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
]

export default function CompanyWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [createdCompany, setCreatedCompany] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const { refresh } = useCompany()
  const { toast } = useToast()

  const [info, setInfo] = useState({
    company_name: '', dba: '', ein: '', mc_number: '', dot_number: '',
    address: '', city: '', state: '', zip: '', phone: '', email: '',
  })
  const [billing, setBilling] = useState({
    company_name: '', address: '', city: '', state: '', zip: '', phone: '', email: '',
  })
  const [remit, setRemit] = useState({
    company_name: '', address: '', city: '', state: '', zip: '', email: '',
  })

  const currentStep = STEPS[step]
  const isLast = step === STEPS.length - 1

  async function handleNext() {
    if (step === 0) {
      // Crear la empresa al terminar paso 1
      if (!info.company_name.trim()) {
        toast.error('El nombre de la empresa es requerido.')
        return
      }
      setSaving(true)
      try {
        const company = await createCompany(info.company_name, info, billing, remit)
        setCreatedCompany(company)
        setStep(1)
      } catch (err) {
        toast.error(err.message)
      } finally {
        setSaving(false)
      }
      return
    }

    if (step === 1) {
      // Guardar billing
      if (createdCompany) {
        setSaving(true)
        try {
          const { supabase } = await import('../lib/supabase')
          await supabase.from('company_settings')
            .update({ billing_info: billing, remit_info: remit })
            .eq('id', createdCompany.id)
        } catch {}
        setSaving(false)
      }
      setStep(2)
      return
    }

    if (step === 2) {
      // Subir logo si hay
      if (logoFile && createdCompany) {
        setSaving(true)
        try {
          const { supabase } = await import('../lib/supabase')
          const filePath = `company/${createdCompany.id}/logo_${Date.now()}.${logoFile.name.split('.').pop()}`
          await supabase.storage.from('company-docs').upload(filePath, logoFile)
          await supabase.from('company_settings').update({ logo_path: filePath }).eq('id', createdCompany.id)
        } catch {}
        setSaving(false)
      }
      setStep(3)
      return
    }

    if (step === 3) {
      await refresh()
      onCreated?.(createdCompany)
      onClose()
    }
  }

  function handleSkip() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header con steps */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Nueva Empresa</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  i < step ? 'bg-orange-600' : i === step ? 'bg-orange-600/30 border border-orange-500' : 'bg-gray-800 border border-gray-700'
                }`}>
                  {i < step ? (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span className={`text-xs font-bold ${i === step ? 'text-orange-400' : 'text-gray-600'}`}>{i + 1}</span>
                  )}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-orange-400' : i < step ? 'text-gray-400' : 'text-gray-600'}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${i < step ? 'bg-orange-600' : 'bg-gray-800'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">

          {/* Paso 1 - Info */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Ingresa la información básica de la empresa. Solo el nombre es requerido.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'company_name', label: 'Nombre de la Empresa *', full: true },
                  { key: 'dba', label: 'DBA (Doing Business As)' },
                  { key: 'ein', label: 'EIN #' },
                  { key: 'mc_number', label: 'MC #' },
                  { key: 'dot_number', label: 'DOT #' },
                  { key: 'phone', label: 'Teléfono' },
                  { key: 'email', label: 'Email' },
                  { key: 'address', label: 'Dirección', full: true },
                  { key: 'city', label: 'Ciudad' },
                  { key: 'state', label: 'Estado' },
                  { key: 'zip', label: 'ZIP' },
                ].map(f => (
                  <div key={f.key} className={f.full ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">{f.label}</label>
                    <input
                      type="text"
                      value={info[f.key]}
                      onChange={e => setInfo(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paso 2 - Billing */}
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-400">Información de facturación para los invoices. Puedes saltarte este paso.</p>

              <div>
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-orange-600/20 text-orange-400 text-xs flex items-center justify-center font-bold">B</span>
                  Bill From
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'company_name', label: 'Nombre', full: true },
                    { key: 'address', label: 'Dirección', full: true },
                    { key: 'city', label: 'Ciudad' },
                    { key: 'state', label: 'Estado' },
                    { key: 'phone', label: 'Teléfono' },
                    { key: 'email', label: 'Email' },
                  ].map(f => (
                    <div key={f.key} className={f.full ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">{f.label}</label>
                      <input
                        type="text"
                        value={billing[f.key]}
                        onChange={e => setBilling(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-orange-600/20 text-orange-400 text-xs flex items-center justify-center font-bold">R</span>
                  Remit To
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'company_name', label: 'Nombre', full: true },
                    { key: 'address', label: 'Dirección', full: true },
                    { key: 'city', label: 'Ciudad' },
                    { key: 'state', label: 'Estado' },
                    { key: 'email', label: 'Email', full: true },
                  ].map(f => (
                    <div key={f.key} className={f.full ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">{f.label}</label>
                      <input
                        type="text"
                        value={remit[f.key]}
                        onChange={e => setRemit(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paso 3 - Logo */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Sube el logo de la empresa para los invoices. Puedes saltarte este paso.</p>
              <div className="flex flex-col items-center gap-4">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-24 object-contain rounded-lg border border-gray-700 p-2 bg-gray-800" />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-gray-800 border-2 border-dashed border-gray-700 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                  </div>
                )}
                <label className="cursor-pointer px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors">
                  {logoPreview ? 'Cambiar logo' : 'Seleccionar logo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                </label>
              </div>
            </div>
          )}

          {/* Paso 4 - Listo */}
          {step === 3 && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">¡Empresa creada!</h3>
              <p className="text-sm text-gray-400">
                <span className="text-orange-400 font-semibold">{info.company_name}</span> ha sido creada exitosamente. Puedes cambiar entre empresas desde el sidebar.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Cancelar
          </button>
          <div className="flex items-center gap-3">
            {step > 0 && step < 3 && (
              <button
                onClick={handleSkip}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Saltar
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', boxShadow: '0 2px 12px rgba(234,88,12,0.3)' }}
            >
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {step === 3 ? 'Ir al Dashboard' : step === 0 ? 'Crear Empresa' : 'Continuar'}
              {step < 3 && !saving && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
