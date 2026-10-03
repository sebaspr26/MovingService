import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { computeDeadhead } from '../lib/deadhead'
import { logAudit } from '../lib/auditLog'
import { useToast } from './Toast'
import DatePicker from './DatePicker'

// Review deadheads (DH) against each truck's previous delivery and apply the
// fixes the user picks. Catches empty DHs and absurd ones: DH used to be
// computed once, when the order was created, so an order registered late (or
// the old "latest delivery even if after the pickup" fallback) left a DH from
// the wrong place — e.g. 850 mi for a 56 mi drive.

const OFF_MIN_DIFF = 50 // mi
const OFF_MIN_RATIO = 0.5
const OFF_MAX_RATIO = 1.6

function startOfPreviousQuarter() {
  const d = new Date()
  const q = Math.floor(d.getMonth() / 3) - 1
  const year = q < 0 ? d.getFullYear() - 1 : d.getFullYear()
  const month = ((q + 4) % 4) * 3 + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function verdict(stored, correct) {
  if (!(stored > 0)) return correct > 0 ? 'empty' : null
  if (Math.abs(stored - correct) < OFF_MIN_DIFF) return null
  if (correct === 0) return 'off'
  const ratio = stored / correct
  return ratio < OFF_MIN_RATIO || ratio > OFF_MAX_RATIO ? 'off' : null
}

export default function DeadheadReview({ orders, truckLabel, session, onApplied, onClose }) {
  const toast = useToast()
  const [from, setFrom] = useState(startOfPreviousQuarter())
  const [progress, setProgress] = useState(null)
  const [proposals, setProposals] = useState(null)
  const [selected, setSelected] = useState({})
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !applying) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, applying])

  async function analyze() {
    // A truck's first order has no previous delivery to start from
    const first = {}
    for (const o of orders) {
      if (!o.truck_id || !o.pu_date) continue
      if (!first[o.truck_id] || o.pu_date < first[o.truck_id].pu_date) first[o.truck_id] = o
    }
    const candidates = orders.filter(o =>
      o.truck_id && o.pu_date && o.pu_date >= from && o.pu_city &&
      !['canceled', 'tonu'].includes(o.status) && first[o.truck_id]?.id !== o.id)

    setProposals(null)
    setProgress({ done: 0, total: candidates.length })
    const found = []
    for (let i = 0; i < candidates.length; i += 4) {
      await Promise.all(candidates.slice(i, i + 4).map(async o => {
        try {
          const dh = await computeDeadhead({ truckId: o.truck_id, pickupDate: o.pu_date, pickupPlace: o.pu_city, excludeOrderId: o.id })
          const stored = Number(o.dead_miles) || 0
          const correct = dh ? dh.miles : 0
          const kind = verdict(stored, correct)
          if (kind) found.push({ order: o, stored, correct, kind, from: dh?.from || null, prevNumber: dh?.prevOrderNumber || null })
        } catch { /* skip orders whose route can't be resolved */ }
      }))
      setProgress({ done: Math.min(i + 4, candidates.length), total: candidates.length })
    }
    found.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'off' ? -1 : 1) || String(a.order.pu_date).localeCompare(String(b.order.pu_date)))
    setProposals(found)
    setSelected(Object.fromEntries(found.map(p => [p.order.id, true])))
    setProgress(null)
  }

  async function apply() {
    const chosen = proposals.filter(p => selected[p.order.id])
    if (!chosen.length) return
    const ok = await toast.confirm(`¿Aplicar el DH corregido en ${chosen.length} órdenes? Cada cambio queda en Auditoría.`, { confirmText: 'Aplicar' })
    if (!ok) return
    setApplying(true)
    const updated = {}
    let skipped = 0
    for (const p of chosen) {
      // Only if the DH is still what was analyzed — don't overwrite a change made meanwhile
      let q = supabase.from('orders').update({ dead_miles: p.correct }).eq('id', p.order.id)
      q = p.stored > 0 ? q.eq('dead_miles', p.stored) : q.or('dead_miles.is.null,dead_miles.eq.0')
      const { data, error } = await q.select('id')
      if (error || !data?.length) { skipped++; continue }
      updated[p.order.id] = p.correct
      logAudit(session, {
        action: 'update_order', entityType: 'order', entityId: p.order.id, entityName: p.order.order_number,
        extraInfo: {
          truck: truckLabel(p.order.truck_id),
          changes: { dead_miles: { from: p.stored, to: p.correct } },
          reason: p.from
            ? `DH revisado: la entrega anterior del camión es ${p.from} (orden #${p.prevNumber})`
            : 'DH revisado: el camión no tiene entrega anterior',
        },
      })
    }
    setApplying(false)
    onApplied(updated)
    toast.success(`DH corregido en ${Object.keys(updated).length} órdenes${skipped ? ` · ${skipped} no se tocaron porque cambiaron mientras tanto` : ''}`)
    onClose()
  }

  const chosenCount = proposals ? proposals.filter(p => selected[p.order.id]).length : 0
  const allOn = proposals?.length > 0 && chosenCount === proposals.length

  return createPortal(
    <div className="fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-3 sm:p-6" onClick={() => !applying && onClose()}>
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-800">
          <div>
            <p className="text-sm font-semibold text-white">Revisar DH (millas vacías)</p>
            <p className="text-xs text-gray-500">Compara el DH de cada orden con la ruta desde la entrega anterior de su camión</p>
          </div>
          <button onClick={onClose} disabled={applying} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="block text-[11px] text-gray-500 mb-1">Órdenes con pickup desde</label>
            <DatePicker value={from} onChange={setFrom} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs hover:border-gray-500" />
          </div>
          {progress ? (
            <div className="flex-1 min-w-[200px]">
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-orange-500 transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div>
              <p className="text-[11px] text-gray-500 mt-1">Analizando {progress.done} de {progress.total} órdenes...</p>
            </div>
          ) : (
            <button onClick={analyze} disabled={!from || applying} className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-500 disabled:opacity-50">
              {proposals ? 'Analizar de nuevo' : 'Analizar'}
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto overscroll-none">
          {!proposals ? (
            <p className="text-sm text-gray-500 text-center py-12">{progress ? '' : 'Elige desde qué fecha revisar y presiona Analizar. No se cambia nada hasta que apliques.'}</p>
          ) : proposals.length === 0 ? (
            <p className="text-sm text-emerald-400 text-center py-12">Todos los DH de ese período están bien.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="text-[11px] uppercase text-gray-500 border-b border-gray-800">
                  <th className="py-2 pl-5 pr-2 text-left">
                    <input type="checkbox" checked={allOn} onChange={() => setSelected(Object.fromEntries(proposals.map(p => [p.order.id, !allOn])))} />
                  </th>
                  <th className="text-left pr-3">Orden</th><th className="text-left pr-3">Pickup</th>
                  <th className="text-right pr-3">DH actual</th><th className="text-right pr-3">Correcto</th><th className="text-left pr-5">Desde</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map(p => (
                  <tr key={p.order.id} className="border-b border-gray-800/60 align-top">
                    <td className="py-2 pl-5 pr-2">
                      <input type="checkbox" checked={!!selected[p.order.id]} onChange={() => setSelected(s => ({ ...s, [p.order.id]: !s[p.order.id] }))} />
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-gray-100">#{p.order.order_number}</span>
                      <span className="block text-[11px] text-gray-500">Camión {truckLabel(p.order.truck_id)}</span>
                    </td>
                    <td className="py-2 pr-3 text-gray-300">{p.order.pu_date}<span className="block text-[11px] text-gray-500">{p.order.pu_city}</span></td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${p.kind === 'off' ? 'text-red-400' : 'text-gray-500'}`}>{p.kind === 'empty' ? 'vacío' : p.stored}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-400 font-medium">{p.correct}</td>
                    <td className="py-2 pr-5 text-[12px] text-gray-400">{p.from ? <>{p.from}<span className="block text-[11px] text-gray-600">orden #{p.prevNumber}</span></> : 'Sin entrega anterior'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {proposals?.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {proposals.filter(p => p.kind === 'off').length} con DH absurdo · {proposals.filter(p => p.kind === 'empty').length} vacíos · {chosenCount} seleccionadas
            </p>
            <button onClick={apply} disabled={!chosenCount || applying} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">
              {applying ? 'Aplicando...' : `Aplicar ${chosenCount} corrección(es)`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
