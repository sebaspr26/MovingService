import { useTheme } from '../lib/theme'

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

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
                  ? 'border-blue-500 ring-1 ring-blue-500/30'
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
                  ? 'border-blue-500 ring-1 ring-blue-500/30'
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
    </div>
  )
}
