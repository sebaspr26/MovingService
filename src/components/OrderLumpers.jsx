import { useState, useEffect, useRef } from 'react'
import { useToast, friendlyError } from './Toast'
import { useAuth } from '../context/AuthContext'
import { canAccess } from '../lib/permissions'
import { analyzeReceipt } from '../lib/gemini'
import { fetchOrderLumpers, lumperAmount, sumUnpaidLumpers } from '../lib/lumpers'
import { createLumpers, updateLumper, deleteLumper, setLumpersPaid } from '../lib/lumperActions'
import DatePicker from './DatePicker'
import ReceiptViewer from './ReceiptViewer'

const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const INPUT = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-orange-500'
const emptyDraft = () => ({ key: Math.random().toString(36).slice(2), amount: '', vendor: '', receipt_number: '', date: '', city: '', notes: '' })

// One lumper's fields — used for new drafts (scanned or typed) and for edits
function LumperFields({ value, onChange, onRemove }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  return (
    <div className="border border-gray-700 rounded-lg p-3 bg-gray-800/30 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="block">
          <span className="block text-[10px] text-gray-500 mb-1">Monto *</span>
          <div className="flex items-center">
            <span className="text-gray-600 text-xs mr-1">$</span>
            <input type="number" step="0.01" min="0" value={value.amount} onChange={e => set('amount', e.target.value)} className={INPUT} />
          </div>
        </label>
        <label className="block col-span-1 sm:col-span-2">
          <span className="block text-[10px] text-gray-500 mb-1">Lumper / lugar</span>
          <input value={value.vendor} onChange={e => set('vendor', e.target.value)} className={INPUT} />
        </label>
        <label className="block">
          <span className="block text-[10px] text-gray-500 mb-1">Recibo #</span>
          <input value={value.receipt_number} onChange={e => set('receipt_number', e.target.value)} className={INPUT} />
        </label>
        <div className="block">
          <span className="block text-[10px] text-gray-500 mb-1">Fecha</span>
          <DatePicker value={value.date} onChange={v => set('date', v)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs hover:border-gray-500" />
        </div>
        <label className="block">
          <span className="block text-[10px] text-gray-500 mb-1">Ciudad</span>
          <input value={value.city} onChange={e => set('city', e.target.value)} placeholder="CITY, ST" className={INPUT} />
        </label>
        <label className="block col-span-2">
          <span className="block text-[10px] text-gray-500 mb-1">Notas</span>
          <input value={value.notes} onChange={e => set('notes', e.target.value)} className={INPUT} />
        </label>
      </div>
      {onRemove && (
        <div className="flex justify-end">
          <button onClick={onRemove} className="text-[11px] text-gray-500 hover:text-red-400 transition-colors">Quitar</button>
        </div>
      )}
    </div>
  )
}

const draftFromLumper = l => ({
  amount: l.amount ?? '', vendor: l.vendor || '', receipt_number: l.receipt_number || '',
  date: l.date || '', city: l.city || '', notes: l.notes || '',
})

/**
 * "Lumper" section of an order: the lumper receipts we paid on this load. Each one
 * keeps its receipt (photo/PDF) and the data read from it. They never change the
 * load's value; an unpaid lumper is an expense of the truck's cycle (see
 * lib/lumpers.js) and shows up in the truck's Gastos tab.
 */
export default function OrderLumpers({ orderId, orderNumber, truckId, cycleId, truckName, onChange }) {
  const toast = useToast()
  const { session } = useAuth()
  const canEdit = canAccess(session, 'orders', 'editar_ordenes')
  const [lumpers, setLumpers] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(true)
  // New lumpers being added: [{...fields}] read from one receipt file, or typed by hand
  const [drafts, setDrafts] = useState(null)
  const [file, setFile] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const fileRef = useRef()
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [viewing, setViewing] = useState(null)

  const ctx = { orderId, orderNumber, truckId, cycleId, truckName }

  useEffect(() => {
    let alive = true
    fetchOrderLumpers(orderId).then(rows => { if (alive) { setLumpers(rows); setLoading(false) } })
    return () => { alive = false }
  }, [orderId])

  function changed() { onChange?.() }

  async function readFile(f) {
    if (!f) return
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf') { toast.warning('Sube una foto o un PDF del recibo'); return }
    setFile(f)
    setScanning(true)
    setDrafts([])
    try {
      const res = await analyzeReceipt(f, { kind: 'lumper' })
      const found = (res.receipts || []).filter(r => r && (Number(r.amount) || r.vendor || r.receipt_number))
      if (!found.length) {
        toast.warning('No se pudo leer el recibo — llena los datos a mano')
        setDrafts([emptyDraft()])
      } else {
        setDrafts(found.map(r => ({
          ...emptyDraft(), amount: Number(r.amount) || '', vendor: r.vendor || '', receipt_number: r.receipt_number || '',
          date: r.date || '', city: r.city || '', notes: r.notes || '',
        })))
      }
    } catch (err) {
      toast.error(friendlyError(err.message))
      setDrafts([emptyDraft()])
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function cancelAdd() { setDrafts(null); setFile(null) }

  async function saveDrafts() {
    const valid = drafts.filter(d => Number(d.amount) > 0)
    if (!valid.length) { toast.warning('Ingresa el monto del lumper'); return }
    setSaving(true)
    try {
      const created = await createLumpers(session, ctx, valid, file)
      setLumpers(prev => [...prev, ...created])
      toast.success(created.length > 1 ? `${created.length} lumpers agregados` : 'Lumper agregado')
      cancelAdd()
      changed()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(lumper) {
    if (!(Number(editDraft.amount) > 0)) { toast.warning('Ingresa el monto del lumper'); return }
    setSaving(true)
    try {
      const updated = await updateLumper(session, ctx, lumper, editDraft)
      setLumpers(prev => prev.map(l => (l.id === lumper.id ? updated : l)))
      setEditingId(null)
      changed()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setSaving(false)
    }
  }

  async function remove(lumper) {
    const ok = await toast.confirm(`¿Eliminar este lumper de ${fmt(lumperAmount(lumper))}?`)
    if (!ok) return
    try {
      await deleteLumper(session, ctx, lumper)
      setLumpers(prev => prev.filter(l => l.id !== lumper.id))
      changed()
    } catch (err) {
      toast.error(friendlyError(err.message))
    }
  }

  async function togglePaid(lumper) {
    const paid = !lumper.paid
    setLumpers(prev => prev.map(l => (l.id === lumper.id ? { ...l, paid } : l)))
    try {
      const [updated] = await setLumpersPaid(session, ctx, [lumper], paid)
      if (updated) setLumpers(prev => prev.map(l => (l.id === lumper.id ? updated : l)))
      changed()
    } catch (err) {
      setLumpers(prev => prev.map(l => (l.id === lumper.id ? lumper : l)))
      toast.error(friendlyError(err.message))
    }
  }

  const total = lumpers.reduce((s, l) => s + lumperAmount(l), 0)
  const pending = sumUnpaidLumpers(lumpers)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {viewing && (
        <ReceiptViewer
          path={viewing.receipt_path}
          title={`Lumper ${viewing.receipt_number || ''} ${viewing.date || ''}`.trim()}
          onClose={() => setViewing(null)}
        />
      )}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-amber-600/20 text-amber-400 text-[11px] font-bold flex items-center justify-center">7</span>
          <h2 className="text-sm font-semibold text-white">Lumper</h2>
          {lumpers.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 font-medium">{lumpers.length}</span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {canEdit && drafts === null && (
            <button onClick={() => { setOpen(true); setDrafts([]); setFile(null) }}
              className="text-blue-400 text-xs font-medium hover:text-orange-300 transition-colors">
              + Agregar lumper
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} className="text-gray-500">
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Add: receipt first, the data is read from it */}
          {drafts !== null && (
            <div className="space-y-3">
              {drafts.length === 0 && !scanning && (
                <div
                  onDragEnter={e => { e.preventDefault(); dragDepth.current++; setDragging(true) }}
                  onDragLeave={e => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); readFile(e.dataTransfer.files?.[0]) }}
                  className={`border-2 border-dashed rounded-xl px-4 py-6 text-center transition-colors ${dragging ? 'border-amber-500 bg-amber-600/10' : 'border-gray-700'}`}
                >
                  <p className="text-xs text-gray-400 mb-3">Sube o arrastra el recibo del lumper — se leen el monto y los datos solos</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button onClick={() => fileRef.current?.click()}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-500 transition-colors">
                      Escanear recibo
                    </button>
                    <button onClick={() => setDrafts([emptyDraft()])}
                      className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors">
                      Sin recibo (a mano)
                    </button>
                    <button onClick={cancelAdd} className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-300 transition-colors">Cancelar</button>
                  </div>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => readFile(e.target.files?.[0])} />

              {scanning && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-purple-300">
                  <span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  Leyendo el recibo...
                </div>
              )}

              {drafts.length > 0 && (
                <>
                  {file && <p className="text-[11px] text-gray-500 truncate">Recibo: {file.name}</p>}
                  {drafts.map((d, i) => (
                    <LumperFields
                      key={d.key}
                      value={d}
                      onChange={v => setDrafts(prev => prev.map((x, j) => (j === i ? v : x)))}
                      onRemove={drafts.length > 1 ? () => setDrafts(prev => prev.filter((_, j) => j !== i)) : null}
                    />
                  ))}
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => setDrafts(prev => [...prev, emptyDraft()])}
                      className="text-[11px] text-blue-400 hover:text-orange-300 transition-colors">+ Otro lumper en este recibo</button>
                    <div className="flex items-center gap-2">
                      <button onClick={cancelAdd} className="px-3 py-1.5 text-gray-400 text-xs hover:text-white transition-colors">Cancelar</button>
                      <button onClick={saveDrafts} disabled={saving}
                        className="px-4 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-500 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                        {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        Guardar{drafts.length > 1 ? ` (${drafts.length})` : ''}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-3"><span className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : lumpers.length === 0 ? (
            drafts === null && <p className="text-xs text-gray-600 text-center py-3">Sin lumpers. Si en esta carga tocó pagar un lumper, agrégalo con su recibo.</p>
          ) : (
            <div className="space-y-2">
              {lumpers.map(l => (
                editingId === l.id ? (
                  <div key={l.id} className="space-y-2">
                    <LumperFields value={editDraft} onChange={setEditDraft} />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-gray-400 text-xs hover:text-white transition-colors">Cancelar</button>
                      <button onClick={() => saveEdit(l)} disabled={saving}
                        className="px-4 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-500 transition-colors disabled:opacity-50">Guardar</button>
                    </div>
                  </div>
                ) : (
                  <div key={l.id} className="flex items-center gap-3 border border-gray-800 rounded-lg px-3 py-2 bg-gray-800/30">
                    <label className={`flex items-center gap-1.5 shrink-0 ${canEdit ? 'cursor-pointer' : ''}`} title={l.paid ? 'Pagado: ya no cuenta como gasto' : 'Sin pagar: cuenta como gasto del camión'}>
                      <input type="checkbox" checked={!!l.paid} disabled={!canEdit} onChange={() => togglePaid(l)} className="accent-emerald-500 w-3.5 h-3.5" />
                      <span className={`text-[10px] font-medium ${l.paid ? 'text-emerald-400' : 'text-gray-500'}`}>{l.paid ? 'Pagado' : 'Sin pagar'}</span>
                    </label>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-200 truncate">
                        {l.vendor || 'Lumper'}{l.receipt_number ? <span className="text-gray-500"> · #{l.receipt_number}</span> : null}
                      </p>
                      <p className="text-[10px] text-gray-600 truncate">{[l.date, l.city, l.notes].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${l.paid ? 'text-gray-500 line-through' : 'text-red-400'}`}>{fmt(lumperAmount(l))}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {l.receipt_path && (
                        <button onClick={() => setViewing(l)} title="Ver recibo" className="p-1 text-gray-500 hover:text-orange-400 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                          </svg>
                        </button>
                      )}
                      {canEdit && (
                        <>
                          <button onClick={() => { setEditingId(l.id); setEditDraft(draftFromLumper(l)) }} title="Editar" className="p-1 text-gray-500 hover:text-orange-400 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                            </svg>
                          </button>
                          <button onClick={() => remove(l)} title="Eliminar" className="p-1 text-gray-500 hover:text-red-400 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <span className="text-gray-600">El lumper no cambia el valor de la carga</span>
                <span className="text-gray-400">
                  Total lumper <span className="text-white font-semibold">{fmt(total)}</span>
                  {pending > 0 && pending !== total && <span className="text-red-400"> · Sin pagar {fmt(pending)}</span>}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
