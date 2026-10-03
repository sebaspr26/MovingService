import { Link } from 'react-router-dom'
import { useCompany } from '../context/CompanyContext'
import { hasFeature } from '../lib/company'

// IFTA (International Fuel Tax Agreement) report — super admin only, and only
// for companies that turned the module on in Configuración.
// Placeholder: the quarterly miles/fuel-by-state report is built next.
export default function Ifta() {
  const { activeCompany, loading } = useCompany()
  if (!loading && !hasFeature(activeCompany, 'ifta')) {
    return (
      <div className="animate-tab-in max-w-md mx-auto text-center pt-16">
        <h1 className="text-xl font-bold text-white">IFTA no está activado</h1>
        <p className="text-sm text-gray-500 mt-2">Este módulo se activa por empresa. Actívalo para esta empresa en Configuración.</p>
        <Link to="/settings" className="inline-block mt-5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">Ir a Configuración</Link>
      </div>
    )
  }
  return (
    <div className="animate-tab-in">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white">IFTA</h1>
        <p className="text-sm text-gray-500 mt-0.5">Reporte trimestral de millas y combustible por estado</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
        <svg className="w-10 h-10 text-blue-500/70 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
        </svg>
        <p className="text-sm text-gray-300 font-medium">Módulo en construcción</p>
        <p className="text-xs text-gray-600 mt-1">Aquí va el reporte IFTA por trimestre, camión y estado</p>
      </div>
    </div>
  )
}
