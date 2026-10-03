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

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  const { session } = useAuth()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuraci&oacute;n</h1>
        <p className="text-sm text-gray-500 mt-1">Preferencias de la aplicaci&oacute;n</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Apariencia</h2>
          <p className="text-xs text-gray-500 mt-0.5">Selecciona el modo de color de la interfaz</p>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-xl border-2 transition-all ${
                isDark
                  ? 'border-orange-500 ring-1 ring-blue-500/30'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="w-full h-20 rounded-lg bg-[#030712] border border-[#1f2937] mb-3 flex flex-col p-2.5 gap-1.5">
                <div className="w-10 h-1.5 rounded bg-[#374151]" />
                <div className="w-14 h-1.5 rounded bg-[#1f2937]" />
                <div className="flex-1 rounded bg-[#111827] mt-1" />
              </div>
              <p className="text-sm font-medium text-gray-300">Dark Mode</p>
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`p-4 rounded-xl border-2 transition-all ${
                !isDark
                  ? 'border-orange-500 ring-1 ring-blue-500/30'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="w-full h-20 rounded-lg bg-[#f9fafb] border border-[#e5e7eb] mb-3 flex flex-col p-2.5 gap-1.5">
                <div className="w-10 h-1.5 rounded bg-[#d1d5db]" />
                <div className="w-14 h-1.5 rounded bg-[#e5e7eb]" />
                <div className="flex-1 rounded bg-white mt-1 border border-[#f3f4f6]" />
              </div>
              <p className="text-sm font-medium text-gray-300">Light Mode</p>
            </button>
          </div>
        </div>
      </div>

      {isSuperAdmin(session) && <CompanyModules />}
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
