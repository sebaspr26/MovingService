import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { analyzeReceipt, isScannerBusy } from '../lib/gemini'
import { useToast, friendlyError } from './Toast'

const EXPENSE_CATEGORIES = [
  'Mantenimiento', 'Seguro', 'Peajes', 'Reparacion', 'Llantas',
  'Lavado', 'Parqueo', 'Multas', 'Comida', 'DEF', 'Otros'
]

const EMPTY_LINE = { type: 'diesel', gallons: '', value: '', category: '', description: '', amount: '' }

export default function AddReceiptModal({ isOpen, onClose, onSaved, truckId, period, editRow, truckOptions, truckCycles }) {
  const toast = useToast()
  const [selectedTruck, setSelectedTruck] = useState('')
  const [invoice, setInvoice] = useState('')
  const [date, setDate] = useState('')
  const [city, setCity] = useState('')
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [scanned, setScanned] = useState(false)
  const fileRef = useRef()
  const processingRef = useRef(false)

  // If truckOptions provided, user must select truck (Dashboard mode)
  const isDashboard = !!truckOptions
  const effectiveTruckId = isDashboard ? selectedTruck : truckId
  const effectivePeriod = isDashboard
    ? (() => {
        const cycle = truckCycles?.[selectedTruck]
        if (!cycle) return null
        const today = new Date().toISOString().split('T')[0]
        return { start: cycle.start_date, end: cycle.end_date || today }
      })()
    : period

  useEffect(() => {
    if (isOpen) {
      setScanError(null)
      setScanned(false)
      setSelectedTruck('')
      if (editRow) {
        setInvoice(editRow.invoice_number || '')
        setDate(editRow.date || '')
        setCity(editRow.city || '')
        if (editRow._type === 'expense') {
          setLines([{ type: 'expense', category: editRow.category || '', description: editRow.description || '', amount: editRow.amount || '', gallons: '', value: '' }])
        } else {
          setLines([{ type: editRow._type, gallons: editRow.gallons || '', value: editRow.value || '', category: '', description: '', amount: '' }])
        }
      } else {
        setInvoice('')
        setDate('')
        setCity('')
        setLines([{ ...EMPTY_LINE }])
      }
    }
  }, [isOpen, editRow])

  if (!isOpen) return null

  function addLine() {
    setLines(prev => [...prev, { ...EMPTY_LINE }])
  }

  function removeLine(i) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateLine(i, field, value) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  async function handleScan(file) {
    if (!file || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) return
    if (processingRef.current || isScannerBusy()) return
    processingRef.current = true
    setScanning(true)
    setScanError(null)
    try {
      const res = await analyzeReceipt(file)
      if (res.items) {
        // Multi-item response (new format)
        if (res.invoice_number) setInvoice(res.invoice_number)
        if (res.date) setDate(res.date)
        if (res.city) setCity(res.city)
        setLines(res.items.map(item => {
          if (item.type === 'diesel' || item.type === 'def') {
            return { type: item.type, gallons: item.gallons || '', value: item.value || '', category: '', description: '', amount: '' }
          }
          return { type: 'expense', category: item.category || 'Otros', description: item.description || '', amount: item.amount || '', gallons: '', value: '' }
        }))
      } else if (res.data) {
        // Legacy single-item response (orders still use this)
        if (res.type === 'order') {
          toast.warning('Este recibo parece ser una orden. Usa la tab de Orders para ingresarla.')
          return
        }
        setInvoice(res.data.invoice_number || '')
        setDate(res.data.date || '')
        setCity(res.data.city || '')
        if (res.type === 'diesel' || res.type === 'def') {
          setLines([{ type: res.type, gallons: res.data.gallons || '', value: res.data.value || '', category: '', description: '', amount: '' }])
        } else if (res.type === 'expense') {
          setLines([{ type: 'expense', category: res.data.category || 'Otros', description: res.data.description || '', amount: res.data.amount || '', gallons: '', value: '' }])
        }
      }
      setScanned(true)
    } catch (err) {
      setScanError(err.message)
    } finally {
      processingRef.current = false
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (isDashboard && !effectiveTruckId) { toast.warning('Selecciona un camion'); return }
    if (!date) { toast.warning('Ingresa la fecha'); return }
    if (!effectivePeriod) { toast.warning('No hay ciclo activo para este camion'); return }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.type === 'diesel' || line.type === 'def') {
        if (!line.value && line.value !== 0) { toast.warning(`Linea ${i + 1}: ingresa el valor`); return }
      } else {
        if (!line.amount && line.amount !== 0) { toast.warning(`Linea ${i + 1}: ingresa el monto`); return }
        if (!line.description) { toast.warning(`Linea ${i + 1}: ingresa la descripcion`); return }
      }
    }

    const tid = effectiveTruckId
    const pStart = effectivePeriod.start
    const pEnd = effectivePeriod.end

    try {
      if (editRow) {
        const line = lines[0]
        const table = editRow._type === 'expense' ? 'expenses' : editRow._type
        let record
        if (editRow._type === 'expense') {
          record = {
            invoice_number: invoice || null,
            date,
            category: line.category || 'Otros',
            description: line.description,
            amount: Number(line.amount) || 0,
            truck_id: tid,
            period_start: pStart,
            period_end: pEnd,
          }
        } else {
          record = {
            invoice_number: invoice,
            date,
            city,
            gallons: Number(line.gallons) || 0,
            value: Number(line.value) || 0,
            truck_id: tid,
            period_start: pStart,
            period_end: pEnd,
          }
        }
        const { error } = await supabase.from(table).update(record).eq('id', editRow.id)
        if (error) throw error
        toast.success('Registro actualizado')
      } else {
        for (const line of lines) {
          if (line.type === 'diesel' || line.type === 'def') {
            const { error } = await supabase.from(line.type).insert({
              invoice_number: invoice,
              date,
              city,
              gallons: Number(line.gallons) || 0,
              value: Number(line.value) || 0,
              truck_id: tid,
              period_start: pStart,
              period_end: pEnd,
            })
            if (error) throw error
          } else {
            const { error } = await supabase.from('expenses').insert({
              category: line.category || 'Otros',
              invoice_number: invoice || null,
              description: line.description,
              amount: Number(line.amount) || 0,
              date,
              truck_id: tid,
              period_start: pStart,
              period_end: pEnd,
            })
            if (error) throw error
          }
        }
        toast.success(lines.length > 1 ? `${lines.length} registros agregados` : 'Registro agregado')
      }
      onSaved()
    } catch (err) {
      toast.error(friendlyError(err.message || err))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">{editRow ? 'Editar Registro' : 'Agregar Gasto'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Scanner */}
          {!editRow && (
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
                    Analizando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                    </svg>
                    Escanear recibo
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => handleScan(e.target.files[0])}
              />
              {scanError && <p className="text-xs text-red-400 mt-1">{scanError}</p>}
            </div>
          )}

          {scanned && (
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="text-xs text-emerald-400">Datos escaneados. Revisa antes de confirmar.</p>
            </div>
          )}

          {/* Truck selector (Dashboard mode) */}
          {isDashboard && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Camion *</label>
              <select
                value={selectedTruck}
                onChange={(e) => setSelectedTruck(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                required
              >
                <option value="">Seleccionar camion...</option>
                {truckOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Shared fields */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Invoice #</label>
              <input
                type="text"
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Fecha *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Ciudad</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="MIAMI, FL"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-400">Items del recibo</label>
              {!editRow && (
                <button type="button" onClick={addLine} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Agregar linea
                </button>
              )}
            </div>

            <div className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className={`rounded-lg p-3 border ${
                  line.type === 'diesel' ? 'bg-orange-900/10 border-orange-800/30'
                  : line.type === 'def' ? 'bg-cyan-900/10 border-cyan-800/30'
                  : 'bg-red-900/10 border-red-800/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-1">
                      {['diesel', 'def', 'expense'].map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateLine(i, 'type', t)}
                          disabled={!!editRow}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            line.type === t
                              ? t === 'diesel' ? 'bg-orange-600/30 text-orange-400 border border-orange-600/50'
                                : t === 'def' ? 'bg-cyan-600/30 text-cyan-400 border border-cyan-600/50'
                                : 'bg-red-600/30 text-red-400 border border-red-600/50'
                              : 'bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300'
                          } disabled:opacity-60`}
                        >
                          {t === 'expense' ? 'Gasto' : t.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {lines.length > 1 && !editRow && (
                      <button type="button" onClick={() => removeLine(i)} className="p-1 text-gray-500 hover:text-red-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {(line.type === 'diesel' || line.type === 'def') ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Galones</label>
                        <input
                          type="number"
                          step="0.01"
                          value={line.gallons}
                          onChange={(e) => updateLine(i, 'gallons', e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Valor ($) *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={line.value}
                          onChange={(e) => updateLine(i, 'value', e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Categoria</label>
                          <select
                            value={line.category}
                            onChange={(e) => updateLine(i, 'category', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Seleccionar...</option>
                            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Monto ($) *</label>
                          <input
                            type="number"
                            step="0.01"
                            value={line.amount}
                            onChange={(e) => updateLine(i, 'amount', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Descripcion *</label>
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateLine(i, 'description', e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

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
              className={`flex-1 px-4 py-2 text-white rounded-lg text-sm transition-colors disabled:opacity-50 ${
                scanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {scanned ? 'Confirmar Datos' : editRow ? 'Guardar' : lines.length > 1 ? `Guardar ${lines.length} items` : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
