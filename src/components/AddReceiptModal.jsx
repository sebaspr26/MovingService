import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { analyzeReceipt, isScannerBusy } from '../lib/gemini'
import { useToast, friendlyError } from './Toast'
import { useAuth } from '../context/AuthContext'
import { computeTruckBalance, logBalanceChange, logBalanceChain } from '../lib/balance'
import { uploadReceipt } from '../lib/receipts'
import ReceiptViewer from './ReceiptViewer'
import DatePicker from './DatePicker'

const EXPENSE_CATEGORIES = [
  'Mantenimiento', 'Seguro', 'Peajes', 'Reparacion', 'Llantas',
  'Lavado', 'Parqueo', 'Multas', 'Comida', 'DEF', 'Otros'
]

const EMPTY_LINE = { type: 'diesel', gallons: '', value: '', category: '', description: '', amount: '' }
const emptyReceipt = () => ({ invoice: '', date: '', city: '', vendor: '', lines: [{ ...EMPTY_LINE }] })

const INPUT = 'sel w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500'
const SMALL_INPUT = 'sel w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-orange-500'

function scannedLine(item) {
  if (item.type === 'diesel' || item.type === 'def') {
    return { type: item.type, gallons: item.gallons || '', value: item.value || '', category: '', description: '', amount: '' }
  }
  return { type: 'expense', category: item.category || 'Otros', description: item.description || '', amount: item.amount || '', gallons: '', value: '' }
}

// Older/other prompt shapes -> list of receipts
function receiptsFromScan(res) {
  if (Array.isArray(res.receipts)) {
    return res.receipts.map(r => ({
      invoice: r.invoice_number || '', date: r.date || '', city: r.city || '', vendor: r.vendor || '',
      lines: (r.items || []).length ? r.items.map(scannedLine) : [{ ...EMPTY_LINE }],
    }))
  }
  if (Array.isArray(res.items)) {
    return [{ invoice: res.invoice_number || '', date: res.date || '', city: res.city || '', vendor: '', lines: res.items.map(scannedLine) }]
  }
  return []
}

const tableFor = type => (type === 'expense' || type === 'chofer') ? 'expenses' : type

export default function AddReceiptModal({ isOpen, onClose, onSaved, truckId, truckName, period, cycle, editRow, truckOptions, truckCycles }) {
  const toast = useToast()
  const { session } = useAuth()
  const [selectedTruck, setSelectedTruck] = useState('')
  // One entry per physical receipt — a single photo can hold several
  const [receipts, setReceipts] = useState([emptyReceipt()])
  // The photo/PDF the receipts came from; uploaded on save and linked to every row
  const [receiptFile, setReceiptFile] = useState(null)
  const [showExistingReceipt, setShowExistingReceipt] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [scanned, setScanned] = useState(false)
  const [scanDragging, setScanDragging] = useState(false)
  const [mounted, setMounted] = useState(isOpen)
  const [visible, setVisible] = useState(false)
  const fileRef = useRef()
  const processingRef = useRef(false)
  const scanDragCounter = useRef(0)

  // If truckOptions provided, user must select truck (Dashboard mode)
  const isDashboard = !!truckOptions
  const effectiveTruckId = isDashboard ? selectedTruck : truckId
  const effectiveTruckName = isDashboard
    ? (truckOptions?.find(t => t.value === effectiveTruckId)?.label || null)
    : (truckName || null)
  const effectiveCycle = isDashboard ? truckCycles?.[selectedTruck] : cycle
  const effectiveCycleId = effectiveCycle?.id || null
  const effectivePeriod = isDashboard
    ? (() => {
        const c = truckCycles?.[selectedTruck]
        if (!c) return null
        const today = new Date().toISOString().split('T')[0]
        return { start: c.start_date, end: c.end_date || today }
      })()
    : period

  useEffect(() => {
    if (isOpen) {
      setScanError(null)
      setScanned(false)
      setSelectedTruck('')
      setReceiptFile(null)
      if (editRow) {
        const line = (editRow._type === 'chofer' || editRow._type === 'expense')
          ? { type: editRow._type, category: editRow.category || '', description: editRow.description || '', amount: editRow.amount || '', gallons: '', value: '' }
          : { type: editRow._type, gallons: editRow.gallons || '', value: editRow.value || '', category: '', description: '', amount: '' }
        setReceipts([{ invoice: editRow.invoice_number || '', date: editRow.date || '', city: editRow.city || '', vendor: '', lines: [line] }])
      } else {
        setReceipts([emptyReceipt()])
      }
    }
  }, [isOpen, editRow])


  // Slide-in/out animation. Unlike the Orders drawer (mounted+animated from a
  // synchronous click handler), this component is always mounted and reacts to
  // the isOpen prop via an effect, one render removed from the click — a single
  // requestAnimationFrame can land in the same paint as the mount and skip the
  // transition, so this needs a double rAF to guarantee an intermediate paint.
  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      let raf2
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true))
      })
      return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2) }
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [isOpen])

  if (!mounted) return null

  const totalLines = receipts.reduce((s, r) => s + r.lines.length, 0)

  function updateReceipt(ri, field, value) {
    setReceipts(prev => prev.map((r, idx) => idx === ri ? { ...r, [field]: value } : r))
  }
  function addReceipt() {
    setReceipts(prev => [...prev, emptyReceipt()])
  }
  function removeReceipt(ri) {
    setReceipts(prev => prev.filter((_, idx) => idx !== ri))
  }
  function addLine(ri) {
    setReceipts(prev => prev.map((r, idx) => idx === ri ? { ...r, lines: [...r.lines, { ...EMPTY_LINE }] } : r))
  }
  function removeLine(ri, li) {
    setReceipts(prev => prev.map((r, idx) => idx === ri ? { ...r, lines: r.lines.filter((_, j) => j !== li) } : r))
  }
  function updateLine(ri, li, field, value) {
    setReceipts(prev => prev.map((r, idx) => idx === ri ? { ...r, lines: r.lines.map((l, j) => j === li ? { ...l, [field]: value } : l) } : r))
  }

  const isAcceptedFile = file => file && (file.type.startsWith('image/') || file.type === 'application/pdf')

  async function handleScan(file) {
    if (!isAcceptedFile(file)) return
    if (processingRef.current || isScannerBusy()) return
    processingRef.current = true
    setScanning(true)
    setScanError(null)
    setReceiptFile(file)
    try {
      const res = await analyzeReceipt(file, { kind: 'receipt' })
      if (res?.type === 'order') {
        toast.warning('Este documento parece ser una orden. Usa la tab de Orders para ingresarla.')
        return
      }
      const found = receiptsFromScan(res || {})
      if (found.length === 0) {
        setScanError('No se detecto ningun recibo en la imagen. Llena los datos a mano — la foto igual se guarda con el gasto.')
        return
      }
      setReceipts(found)
      setScanned(true)
      if (found.length > 1) toast.success(`Se detectaron ${found.length} recibos en la imagen`)
    } catch (err) {
      setScanError(err.message)
    } finally {
      processingRef.current = false
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Inserts a row with its receipt; if the receipt_path column isn't in the DB
  // yet (033_receipt_images.sql not run), saves the row without it rather than failing
  async function insertRow(table, record) {
    let res = await supabase.from(table).insert(record).select().single()
    if (res.error && record.receipt_path !== undefined && /receipt_path/i.test(res.error.message || '')) {
      const rest = { ...record }
      delete rest.receipt_path
      res = await supabase.from(table).insert(rest).select().single()
      if (!res.error) toast.warning('El gasto se guardo, pero la foto no quedo enlazada: falta aplicar la actualizacion de la base de datos (033_receipt_images.sql)')
    }
    return res
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return

    if (isDashboard && !effectiveTruckId) { toast.warning('Selecciona un camion'); return }
    if (!effectivePeriod) { toast.warning('No hay ciclo activo para este camion'); return }

    for (let ri = 0; ri < receipts.length; ri++) {
      const r = receipts[ri]
      const label = receipts.length > 1 ? `Recibo ${ri + 1}` : 'Recibo'
      if (!r.date) { toast.warning(`${label}: ingresa la fecha`); return }
      if (r.lines.length === 0) { toast.warning(`${label}: agrega al menos un item`); return }
      for (let li = 0; li < r.lines.length; li++) {
        const line = r.lines[li]
        const where = `${label}, linea ${li + 1}`
        if (line.type === 'diesel' || line.type === 'def') {
          if (!line.value && line.value !== 0) { toast.warning(`${where}: ingresa el valor`); return }
        } else {
          if (!line.amount && line.amount !== 0) { toast.warning(`${where}: ingresa el monto`); return }
          if (!line.description) { toast.warning(`${where}: ingresa la descripcion`); return }
        }
      }
    }

    const tid = effectiveTruckId
    const pStart = effectivePeriod.start
    const pEnd = effectivePeriod.end

    setSaving(true)
    try {
      // Duplicate check by invoice_number, per receipt
      if (!editRow) {
        for (const r of receipts.filter(r => r.invoice)) {
          const tables = [...new Set(r.lines.map(l => tableFor(l.type)))]
          let dup = null
          for (const table of tables) {
            const { data: existing } = await supabase.from(table).select('id').eq('truck_id', tid).eq('invoice_number', r.invoice).limit(1)
            if (existing && existing.length > 0) { dup = table; break }
          }
          if (dup) {
            const ok = await toast.confirm(`Ya existe un registro de ${dup === 'expenses' ? 'gasto' : dup} con invoice "${r.invoice}". ¿Agregar de todas formas?`)
            if (!ok) return
          }
        }
      }

      // Todo gasto/diesel/DEF afecta el balance del ciclo — se captura antes de escribir
      const balanceBefore = await computeTruckBalance(tid, effectiveCycleId)

      let receiptPath
      if (receiptFile) {
        try {
          receiptPath = await uploadReceipt(receiptFile, tid)
        } catch (err) {
          const ok = await toast.confirm(`No se pudo subir la foto del recibo (${err.message}). ¿Guardar el gasto sin la foto?`)
          if (!ok) return
        }
      }

      if (editRow) {
        const r = receipts[0]
        const line = r.lines[0]
        const table = tableFor(editRow._type)
        const record = (editRow._type === 'expense' || editRow._type === 'chofer')
          ? { invoice_number: r.invoice || null, date: r.date, category: line.category || 'Otros', description: line.description, amount: Number(line.amount) || 0 }
          : { invoice_number: r.invoice, date: r.date, city: r.city, gallons: Number(line.gallons) || 0, value: Number(line.value) || 0 }
        Object.assign(record, { truck_id: tid, cycle_id: effectiveCycleId, period_start: pStart, period_end: pEnd })
        if (receiptPath) record.receipt_path = receiptPath
        let { error } = await supabase.from(table).update(record).eq('id', editRow.id)
        // receipt_path column not in the DB yet (033_receipt_images.sql) — save the rest
        if (error && receiptPath && /receipt_path/i.test(error.message || '')) {
          delete record.receipt_path
          ;({ error } = await supabase.from(table).update(record).eq('id', editRow.id))
          if (!error) toast.warning('El registro se guardo, pero la foto no quedo enlazada: falta aplicar la actualizacion de la base de datos (033_receipt_images.sql)')
        }
        if (error) throw error
        const actionType = editRow._type === 'diesel' ? 'diesel' : editRow._type === 'def' ? 'def' : 'expense'
        logBalanceChange(session, {
          action: `update_${actionType}`,
          entityType: actionType,
          entityId: editRow.id,
          entityName: effectiveTruckName,
          truckId: tid,
          cycleId: effectiveCycleId,
          balanceBefore,
          extraInfo: actionType === 'expense'
            ? { category: record.category, description: record.description, amount: record.amount }
            : { invoice_number: record.invoice_number, gallons: record.gallons, value: record.value, city: record.city },
        })
        toast.success('Registro actualizado')
      } else {
        const entries = []
        for (const r of receipts) {
          for (const line of r.lines) {
            const base = { truck_id: tid, cycle_id: effectiveCycleId, period_start: pStart, period_end: pEnd, date: r.date }
            if (receiptPath) base.receipt_path = receiptPath
            if (line.type === 'diesel' || line.type === 'def') {
              const value = Number(line.value) || 0
              const { data: saved, error } = await insertRow(line.type, {
                ...base, invoice_number: r.invoice, city: r.city, gallons: Number(line.gallons) || 0, value,
              })
              if (error) throw error
              entries.push({
                action: `create_${line.type}`, entityType: line.type, entityId: saved?.id, entityName: effectiveTruckName, delta: -value,
                extraInfo: { invoice_number: r.invoice || null, gallons: Number(line.gallons) || 0, value, city: r.city },
              })
            } else {
              const category = line.type === 'chofer' ? 'Pago Chofer' : (line.category || 'Otros')
              const amount = Number(line.amount) || 0
              const { data: saved, error } = await insertRow('expenses', {
                ...base, category, invoice_number: r.invoice || null, description: line.description, amount,
                created_by_email: session?.user?.email || null,
                created_by_name: session?.user?.user_metadata?.name || null,
              })
              if (error) throw error
              entries.push({
                action: 'create_expense', entityType: 'expense', entityId: saved?.id, entityName: effectiveTruckName, delta: -amount,
                extraInfo: { category, description: line.description, amount, invoice_number: r.invoice || null },
              })
            }
          }
        }
        logBalanceChain(session, { truckId: tid, cycleId: effectiveCycleId, balanceBefore, entries })
        toast.success(entries.length > 1 ? `${entries.length} registros agregados` : 'Registro agregado')
      }
      onSaved()
    } catch (err) {
      toast.error(friendlyError(err.message || err))
    } finally {
      setSaving(false)
    }
  }

  const existingReceiptPath = editRow?.receipt_path || null

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`} />
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-lg bg-gray-950 border-l border-gray-800 overflow-y-auto flex flex-col transform transition-transform duration-300 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
          <h3 className="text-lg font-semibold text-white">{editRow ? 'Editar Registro' : 'Agregar Gasto'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {showExistingReceipt && <ReceiptViewer path={existingReceiptPath} onClose={() => setShowExistingReceipt(false)} />}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Scanner */}
          {!editRow && (
            <div
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); scanDragCounter.current++; setScanDragging(true) }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); scanDragCounter.current--; if (scanDragCounter.current === 0) setScanDragging(false) }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); scanDragCounter.current = 0; setScanDragging(false); const f = e.dataTransfer.files[0]; if (f) handleScan(f) }}
            >
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={scanning}
                className={`w-full px-4 py-3 border rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  scanDragging
                    ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                    : 'bg-purple-600/20 border-purple-600/50 text-purple-300 hover:bg-purple-600/30'
                }`}
              >
                {scanning ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analizando...
                  </>
                ) : scanDragging ? (
                  'Soltar archivo aqui'
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                    </svg>
                    Escanear recibos (uno o varios en la foto)
                  </>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleScan(e.target.files[0])} />
              {scanError && <p className="text-xs text-red-400 mt-1">{scanError}</p>}
            </div>
          )}

          {/* The scanned photo is saved with the rows automatically — no UI for it.
              Editing a row that has one only offers a link to see it */}
          {editRow && existingReceiptPath && (
            <button type="button" onClick={() => setShowExistingReceipt(true)} className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
              </svg>
              Ver foto del recibo
            </button>
          )}

          {scanned && (
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="text-xs text-emerald-400">
                {receipts.length > 1 ? `${receipts.length} recibos detectados. ` : 'Datos escaneados. '}Revisa antes de confirmar.
              </p>
            </div>
          )}

          {/* Truck selector (Dashboard mode) */}
          {isDashboard && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Camion *</label>
              <select value={selectedTruck} onChange={(e) => setSelectedTruck(e.target.value)} className={INPUT} required>
                <option value="">Seleccionar camion...</option>
                {truckOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* One card per receipt */}
          <div className="space-y-4">
            {receipts.map((r, ri) => (
              <div key={ri} className={receipts.length > 1 ? 'rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-3' : 'space-y-3'}>
                {receipts.length > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-300">
                      Recibo {ri + 1} de {receipts.length}
                      {r.vendor && <span className="font-normal text-gray-500"> · {r.vendor}</span>}
                    </p>
                    {!editRow && (
                      <button type="button" onClick={() => removeReceipt(ri)} className="text-[11px] text-gray-500 hover:text-red-400">Quitar recibo</button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Invoice #</label>
                    <input type="text" value={r.invoice} onChange={(e) => updateReceipt(ri, 'invoice', e.target.value)} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Fecha *</label>
                    <DatePicker value={r.date} onChange={v => updateReceipt(ri, 'date', v)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm hover:border-gray-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Ciudad</label>
                    <input type="text" value={r.city} onChange={(e) => updateReceipt(ri, 'city', e.target.value)} placeholder="MIAMI, FL" className={INPUT} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-400">Items del recibo</label>
                    {!editRow && (
                      <button type="button" onClick={() => addLine(ri)} className="text-xs text-blue-400 hover:text-orange-300 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Agregar linea
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {r.lines.map((line, li) => (
                      <div key={li} className={`rounded-lg p-3 border ${
                        line.type === 'diesel' ? 'bg-orange-900/10 border-orange-800/30'
                        : line.type === 'def' ? 'bg-cyan-900/10 border-cyan-800/30'
                        : line.type === 'chofer' ? 'bg-violet-900/10 border-violet-800/30'
                        : 'bg-red-900/10 border-red-800/30'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex gap-1">
                            {['diesel', 'def', 'chofer', 'expense'].map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => updateLine(ri, li, 'type', t)}
                                disabled={!!editRow}
                                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                  line.type === t
                                    ? t === 'diesel' ? 'bg-orange-600/30 text-orange-400 border border-orange-600/50'
                                      : t === 'def' ? 'bg-cyan-600/30 text-cyan-400 border border-cyan-600/50'
                                      : t === 'chofer' ? 'bg-violet-600/30 text-violet-400 border border-violet-600/50'
                                      : 'bg-red-600/30 text-red-400 border border-red-600/50'
                                    : 'bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300'
                                } disabled:opacity-60`}
                              >
                                {t === 'expense' ? 'Gasto' : t === 'chofer' ? 'Chofer' : t.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          {r.lines.length > 1 && !editRow && (
                            <button type="button" onClick={() => removeLine(ri, li)} className="p-1 text-gray-500 hover:text-red-400">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {(line.type === 'diesel' || line.type === 'def') ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">Galones</label>
                              <input type="number" step="0.01" value={line.gallons} onChange={(e) => updateLine(ri, li, 'gallons', e.target.value)} className={SMALL_INPUT} />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">Valor ($) *</label>
                              <input type="number" step="0.01" value={line.value} onChange={(e) => updateLine(ri, li, 'value', e.target.value)} className={SMALL_INPUT} required />
                            </div>
                          </div>
                        ) : line.type === 'chofer' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">Descripcion *</label>
                              <input type="text" value={line.description} onChange={(e) => updateLine(ri, li, 'description', e.target.value)} placeholder="Ej: Sem 11-17 May" className={SMALL_INPUT} required />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">Monto ($) *</label>
                              <input type="number" step="0.01" value={line.amount} onChange={(e) => updateLine(ri, li, 'amount', e.target.value)} className={SMALL_INPUT} required />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-1">Categoria</label>
                                <select value={line.category} onChange={(e) => updateLine(ri, li, 'category', e.target.value)} className={SMALL_INPUT}>
                                  <option value="">Seleccionar...</option>
                                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-1">Monto ($) *</label>
                                <input type="number" step="0.01" value={line.amount} onChange={(e) => updateLine(ri, li, 'amount', e.target.value)} className={SMALL_INPUT} required />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">Descripcion *</label>
                              <input type="text" value={line.description} onChange={(e) => updateLine(ri, li, 'description', e.target.value)} className={SMALL_INPUT} required />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!editRow && (
            <button type="button" onClick={addReceipt} className="w-full py-2 border border-dashed border-gray-700 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors">
              + Agregar otro recibo
            </button>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={scanning || saving}
              className={`flex-1 px-4 py-2 text-white rounded-lg text-sm transition-colors disabled:opacity-50 ${
                scanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-orange-600 hover:bg-orange-500'
              }`}
            >
              {saving ? 'Guardando...' : scanned ? 'Confirmar Datos' : editRow ? 'Guardar' : totalLines > 1 ? `Guardar ${totalLines} items` : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
