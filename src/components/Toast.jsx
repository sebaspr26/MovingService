import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext()

export function useToast() {
  return useContext(ToastContext)
}

// Traduce errores comunes de Supabase/PostgreSQL a mensajes claros en espanol
export function friendlyError(msg) {
  if (!msg) return 'Error desconocido'
  const s = String(msg)
  if (s.includes('invalid input syntax for type numeric'))
    return 'Uno de los campos numericos tiene un valor invalido. Revisa que los montos y cantidades esten correctos.'
  if (s.includes('null value in column') || s.includes('violates not-null'))
    return 'Faltan campos obligatorios. Revisa el formulario.'
  if (s.includes('duplicate key') || s.includes('unique constraint'))
    return 'Ya existe un registro con esos datos.'
  if (s.includes('foreign key') || s.includes('violates foreign key'))
    return 'Referencia invalida. El camion o registro asociado no existe.'
  if (s.includes('Failed to fetch') || s.includes('NetworkError') || s.includes('ERR_NETWORK'))
    return 'Error de conexion. Verifica tu internet e intenta de nuevo.'
  if (s.includes('JWT') || s.includes('token'))
    return 'Sesion expirada. Recarga la pagina.'
  return s
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info'),
    confirm: (message, opts) => new Promise(resolve => {
      setConfirmState({ message, resolve, ...opts })
    }),
  }

  function handleConfirm(result) {
    if (confirmState) confirmState.resolve(result)
    setConfirmState(null)
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Toast container - top right */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '380px' }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-5 toast-slide-in">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-full bg-red-900/50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <p className="text-sm text-gray-200 pt-1.5">{confirmState.message}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirm(true)}
                autoFocus
                className={`flex-1 px-4 py-2 text-white rounded-lg text-sm transition-colors ${confirmState.confirmClass || 'bg-red-600 hover:bg-red-500'}`}
              >
                {confirmState.confirmText || 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

const TOAST_CONFIG = {
  success: {
    bg: 'bg-green-950/95',
    border: 'border-green-800',
    text: 'text-green-300',
    iconBg: 'bg-green-900/60',
    icon: (
      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    ),
  },
  error: {
    bg: 'bg-red-950/95',
    border: 'border-red-800',
    text: 'text-red-300',
    iconBg: 'bg-red-900/60',
    icon: (
      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-yellow-950/95',
    border: 'border-yellow-800',
    text: 'text-yellow-300',
    iconBg: 'bg-yellow-900/60',
    icon: (
      <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
  },
  info: {
    bg: 'bg-blue-950/95',
    border: 'border-blue-800',
    text: 'text-blue-300',
    iconBg: 'bg-blue-900/60',
    icon: (
      <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    ),
  },
}

function ToastItem({ toast, onClose }) {
  const c = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info

  return (
    <div className={`${c.bg} border ${c.border} rounded-lg px-4 py-3 shadow-2xl pointer-events-auto flex items-start gap-3 toast-slide-in backdrop-blur-sm`}>
      <div className={`w-6 h-6 rounded-full ${c.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
        {c.icon}
      </div>
      <p className={`text-sm ${c.text} flex-1 leading-snug pt-0.5`}>{toast.message}</p>
      <button onClick={onClose} className="text-gray-500 hover:text-gray-300 shrink-0 mt-0.5">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
