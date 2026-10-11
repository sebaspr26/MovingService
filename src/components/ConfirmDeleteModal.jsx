import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Extra-careful confirmation for deleting something that can't be undone: the person
 * has to TYPE a word (the user's name) before the red button works. `children` is the
 * list of consequences shown above the field.
 */
export default function ConfirmDeleteModal({ title, subtitle, confirmWord, confirmLabel = 'Eliminar', busy = false, onConfirm, onClose, children }) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === String(confirmWord).trim().toLowerCase()

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return createPortal(
    <div className="fixed inset-0 bg-black/70 z-[120] flex items-center justify-center p-4 animate-modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="bg-gray-950 border border-red-900/50 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-modal-panel" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="w-10 h-10 rounded-full bg-red-900/40 border border-red-800/50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="text-sm text-gray-300 space-y-2">{children}</div>
          <label className="block">
            <span className="block text-xs text-gray-400 mb-1.5">Para confirmar, escribe <span className="font-semibold text-red-300 select-all">{confirmWord}</span></span>
            <input
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && matches && !busy) onConfirm() }}
              disabled={busy}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-red-500"
              placeholder={confirmWord}
            />
          </label>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50">Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={!matches || busy}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {busy ? 'Eliminando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
