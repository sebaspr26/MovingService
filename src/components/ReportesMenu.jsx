import { Link } from 'react-router-dom'
import { useCompany } from '../context/CompanyContext'
import { hasFeature } from '../lib/company'
import { useAuth } from '../context/AuthContext'
import { canAccess } from '../lib/permissions'

export default function ReportesMenu() {
  const { activeCompany } = useCompany()
  const { session } = useAuth()
  const iftaOn = hasFeature(activeCompany, 'ifta') && canAccess(session, 'reportes', 'ifta')
  const auditoriaOn = canAccess(session, 'reportes', 'auditoria')
  return (
    <div className="flex flex-col items-center pt-4 pb-2">
      <div className="flex flex-col items-center text-center mb-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
        >
          <svg className="w-8 h-8" style={{ color: '#3b82f6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Reportes</h1>
        <p className="text-gray-500 text-sm mt-1.5">Selecciona el reporte</p>
      </div>

      <div className="grid grid-cols-1 gap-3 w-full max-w-sm">
        {iftaOn && (
        <Link
          to="/reportes/ifta"
          className="group relative flex items-center gap-4 p-5 rounded-2xl transition-all active:scale-95"
          style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(59,130,246,0.2)' }}
          >
            <svg className="w-6 h-6" style={{ color: '#3b82f6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">IFTA</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Millas y combustible por estado</p>
          </div>
          <svg className="w-4 h-4 opacity-40" style={{ color: '#3b82f6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
        )}

        {auditoriaOn && (
        <Link
          to="/reportes/auditoria"
          className="group relative flex items-center gap-4 p-5 rounded-2xl transition-all active:scale-95"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(139,92,246,0.2)' }}
          >
            <svg className="w-6 h-6" style={{ color: '#8b5cf6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Auditoría</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Todo lo que mueve el balance</p>
          </div>
          <svg className="w-4 h-4 opacity-40" style={{ color: '#8b5cf6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
        )}
      </div>
    </div>
  )
}
