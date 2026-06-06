import { useState, useEffect, useRef } from 'react'
import { analyzeReceipt } from '../lib/gemini'

export default function AddModal({ isOpen, onClose, onSave, fields, initialData, title, onScan }) {
  const [formData, setFormData] = useState({})
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    if (isOpen) {
      const initial = {}
      fields.forEach(f => {
        initial[f.name] = initialData?.[f.name] ?? f.default ?? ''
      })
      setFormData(initial)
      setScanError(null)
    }
  }, [isOpen, initialData, fields])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  async function handleScanFile(file) {
    if (!file || !file.type.startsWith('image/') || scanning) return
    setScanning(true)
    setScanError(null)
    try {
      const res = await analyzeReceipt(file)
      if (res.data) {
        setFormData(prev => {
          const updated = { ...prev }
          for (const [key, val] of Object.entries(res.data)) {
            if (fields.some(f => f.name === key) && val !== '' && val !== 0) {
              updated[key] = val
            }
          }
          return updated
        })
      }
      if (onScan) onScan(res)
    } catch (err) {
      setScanError(err.message)
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Scan button inside modal */}
          {onScan !== undefined && (
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={scanning}
                className="w-full px-4 py-3 bg-purple-600/20 border border-purple-600/50 text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {scanning ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analizando imagen...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                    </svg>
                    Escanear recibo con camara
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleScanFile(e.target.files[0])}
              />
              {scanError && <p className="text-xs text-red-400 mt-1">{scanError}</p>}
            </div>
          )}

          {fields.map(field => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                {field.label}
              </label>
              {field.type === 'select' ? (
                <select
                  value={formData[field.name] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  required={field.required}
                >
                  <option value="">Seleccionar...</option>
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || 'text'}
                  step={field.step}
                  value={formData[field.name] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  required={field.required}
                  placeholder={field.placeholder}
                />
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={scanning}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
