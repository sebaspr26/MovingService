import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { isSuperAdmin } from '../lib/permissions'
import { hasFeature, setCompanyFeature } from '../lib/company'
import { useToast } from './Toast'

// Optional modules each company can turn on for itself
const MODULES = [
  {
    key: 'ifta',
    label: 'IFTA',
    description: 'Reporte trimestral de millas y combustible por estado (solo camiones dry van). Aparece en Reportes.',
  },
]

// Mini screen drawn with the look's own colors
function ThemeCard({ t, selected, onSelect }) {
  const p = t.preview
  return (
    <button
      onClick={onSelect}
      className={`p-3 rounded-xl border-2 text-left transition-all ${
        selected ? 'border-orange-500 ring-1 ring-orange-500/30' : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="w-full h-20 rounded-lg mb-3 flex gap-1.5 p-2 overflow-hidden" style={{ background: p.bg, border: `1px solid ${p.soft}` }}>
        <div className="w-5 rounded flex flex-col gap-1 p-1" style={{ background: p.card, border: `1px solid ${p.soft}` }}>
          <div className="h-1 rounded-sm" style={{ background: '#ea580c' }} />
          <div className="h-1 rounded-sm" style={{ background: p.line }} />
          <div className="h-1 rounded-sm" style={{ background: p.line }} />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="w-10 h-1.5 rounded" style={{ background: p.line }} />
          <div className="flex-1 rounded p-1.5 flex flex-col gap-1" style={{ background: p.card, border: `1px solid ${p.soft}` }}>
            <div className="w-12 h-1 rounded" style={{ background: p.line }} />
            <div className="w-8 h-1 rounded" style={{ background: p.soft }} />
            <div className="mt-auto self-end w-6 h-2 rounded-sm" style={{ background: '#ea580c' }} />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-200">{t.label}</p>
        {selected && (
          <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{t.hint}</p>
    </button>
  )
}

export default function Settings() {
  const { theme, setTheme, themes } = useTheme()
  const { session } = useAuth()
  // The look is for everyone; the company's optional modules (IFTA) only for admins
  const canManageModules = isSuperAdmin(session) || session?.user?.user_metadata?.role === 'admin'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuraci&oacute;n</h1>
        <p className="text-sm text-gray-500 mt-1">Preferencias de la aplicaci&oacute;n</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Apariencia</h2>
          <p className="text-xs text-gray-500 mt-0.5">Elige el color de toda la aplicación. Se guarda en este navegador.</p>
        </div>

        <div className="p-5 space-y-5">
          {[{ mode: 'dark', title: 'Oscuros' }, { mode: 'light', title: 'Claros' }].map(group => (
            <div key={group.mode}>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">{group.title}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {themes.filter(t => t.mode === group.mode).map(t => (
                  <ThemeCard key={t.id} t={t} selected={theme === t.id} onSelect={(e) => setTheme(t.id, e)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {canManageModules && <CompanyModules />}
    </div>
  )
}

function CompanyModules() {
  const toast = useToast()
  const { activeCompany, refresh } = useCompany()
  const [saving, setSaving] = useState(null)
  const companyName = activeCompany?.company_info?.company_name || activeCompany?.display_name || 'esta empresa'

  async function toggle(mod) {
    const next = !hasFeature(activeCompany, mod.key)
    setSaving(mod.key)
    try {
      await setCompanyFeature(mod.key, next, activeCompany?.id)
      await refresh()
      toast.success(`${mod.label} ${next ? 'activado' : 'desactivado'} para ${companyName}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Módulos de la empresa</h2>
        <p className="text-xs text-gray-500 mt-0.5">Se activan por empresa · Empresa actual: <span className="text-gray-300">{companyName}</span></p>
      </div>
      <div className="divide-y divide-gray-800">
        {MODULES.map(mod => {
          const on = hasFeature(activeCompany, mod.key)
          return (
            <div key={mod.key} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-200">{mod.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{mod.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={saving === mod.key || !activeCompany}
                onClick={() => toggle(mod)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${on ? 'bg-emerald-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
