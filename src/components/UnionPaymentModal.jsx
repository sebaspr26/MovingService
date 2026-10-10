import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/orders'
import { getActiveCompanyId } from '../lib/company'
import { useToast } from './Toast'
import { useAuth } from '../context/AuthContext'
import { canDelete, isSuperAdmin } from '../lib/permissions'
import { createDispatcherPayment, deleteDispatcherPayment, emailSettlement, dispatcherProfileRate } from '../lib/dispatcherPayments'
import { normEmail } from '../lib/dispatcherUnions'

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = String(d).split('T')[0].split('-')
  return `${m}/${day}/${y}`
}
function fmtShort(d) {
  if (!d) return '—'
  const [, m, day] = d.split('-')
  return `${m}/${day}`
}

/**
 * Pagos de una UNION de dispatchers: las cargas y los pagos de todos van juntos y
 * aqui no se dice quien hizo cual carga. Al guardar un pago se crea un pago normal
 * POR dispatcher (sus cargas, su comision), asi cada uno recibe su propio settlement
 * con SUS cargas; todos comparten `union_group`. Los settlements individuales solo
 * se ven separando la union (super admin, atajo en Pago Dispatchers).
 */
export default function UnionPaymentModal({ union, memberUsers, onClose, highlightOrderId }) {
  const { session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const cId = getActiveCompanyId()
  const superAdmin = isSuperAdmin(session)

  const [payments, setPayments] = useState([])
  const [orders, setOrders] = useState([])
  const [blockedOrders, setBlockedOrders] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingKey, setSendingKey] = useState(null)
  const [expandedKey, setExpandedKey] = useState(null)
  const [groupOrders, setGroupOrders] = useState({}) // { [groupKey]: orders[] | 'loading' }
  const highlightRef = useRef(null)

  const userByEmail = useMemo(() => Object.fromEntries(memberUsers.map(u => [normEmail(u.email), u])), [memberUsers])
  const emails = useMemo(() => memberUsers.map(u => u.email).filter(Boolean), [memberUsers])
  const rateOf = email => dispatcherProfileRate(userByEmail[normEmail(email)] || { user_metadata: {} }, cId)

  async function fetchData() {
    setLoading(true)
    const pq = supabase.from('dispatcher_payments').select('*').in('dispatcher_email', emails).order('created_at', { ascending: false })
    const oq = supabase.from('orders')
      .select('id, order_number, pu_city, do_city, pu_date, do_date, rate, status, truck_id, cycle_id, paid, dispatcher')
      .in('dispatcher', emails)
      .in('status', ['booked', 'assigned', 'in_transit', 'delivered', 'invoiced', 'paid'])
      .order('pu_date', { ascending: false })
    const [{ data: pays }, { data: ords }] = await Promise.all([cId ? pq.eq('company_id', cId) : pq, cId ? oq.eq('company_id', cId) : oq])
    const used = new Set((pays || []).flatMap(p => p.order_ids || []))
    const free = (ords || []).filter(o => !used.has(o.id))
    setPayments(pays || [])
    setOrders(free.filter(o => o.paid === true))
    setBlockedOrders(free.filter(o => o.paid !== true))
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  // One entry per union payment (its per-dispatcher rows share union_group); payments
  // made before the union existed stay as one entry each. Numbered oldest-first.
  const groups = useMemo(() => {
    const map = new Map()
    for (const p of payments) {
      const key = p.union_group || p.id
      if (!map.has(key)) map.set(key, { key, payments: [] })
      map.get(key).payments.push(p)
    }
    const list = [...map.values()].map(g => ({
      ...g,
      createdAt: g.payments.map(p => p.created_at).sort()[0],
      payDate: g.payments[0].pay_date,
      payout: g.payments.reduce((s, p) => s + (Number(p.payout) || 0), 0),
      gross: g.payments.reduce((s, p) => s + (Number(p.gross_revenue) || 0), 0),
      orderIds: g.payments.flatMap(p => p.order_ids || []),
      periodStart: g.payments.map(p => p.period_start).filter(Boolean).sort()[0],
      periodEnd: g.payments.map(p => p.period_end).filter(Boolean).sort().slice(-1)[0],
      sentAll: g.payments.every(p => p.email_sent_at),
    }))
    list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    list.forEach((g, i) => { g.number = i + 1 })
    return list.reverse()
  }, [payments])

  async function toggleGroup(g) {
    if (expandedKey === g.key) { setExpandedKey(null); return }
    setExpandedKey(g.key)
    if (!groupOrders[g.key]) {
      setGroupOrders(prev => ({ ...prev, [g.key]: 'loading' }))
      const { data } = await supabase.from('orders').select('id, order_number, pu_city, do_city, pu_date, rate').in('id', g.orderIds).order('pu_date')
      setGroupOrders(prev => ({ ...prev, [g.key]: data || [] }))
    }
  }

  // Arriving from the "#N" badge in Orders: open the union payment holding that order
  useEffect(() => {
    if (!highlightOrderId || groups.length === 0) return
    const g = groups.find(x => x.orderIds.includes(highlightOrderId))
    if (g && expandedKey !== g.key) toggleGroup(g)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightOrderId, groups])
  useEffect(() => { highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [groupOrders])

  const selectedOrders = orders.filter(o => selectedIds.has(o.id))
  const gross = selectedOrders.reduce((s, o) => s + (Number(o.rate) || 0), 0)
  const payout = selectedOrders.reduce((s, o) => s + (Number(o.rate) || 0) * rateOf(o.dispatcher) / 100, 0)

  function toggleOrder(id) {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleAll() {
    setSelectedIds(selectedIds.size === orders.length ? new Set() : new Set(orders.map(o => o.id)))
  }

  async function handleBlockedClick(order) {
    if (!superAdmin) return
    const ok = await toast.confirm(`La orden ${order.order_number || ''} aun no esta marcada como pagada. ¿Incluirla de todas formas en este pago?`, { confirmText: 'Incluir', confirmClass: 'bg-orange-600 hover:bg-orange-500' })
    if (!ok) return
    setBlockedOrders(prev => prev.filter(o => o.id !== order.id))
    setOrders(prev => [...prev, order])
    setSelectedIds(prev => new Set(prev).add(order.id))
  }

  async function savePayment() {
    if (!selectedIds.size) return toast.warning('Selecciona al menos una orden')
    const byMember = {}
    selectedOrders.forEach(o => { (byMember[normEmail(o.dispatcher)] ||= []).push(o) })
    if (Object.keys(byMember).some(email => !(rateOf(email) > 0))) {
      return toast.warning('Falta configurar la comision de un dispatcher de la union. Configurala en Perfiles.')
    }
    setSaving(true)
    const group = crypto.randomUUID()
    let done = 0
    for (const [email, ords] of Object.entries(byMember)) {
      const user = userByEmail[email]
      if (!user) continue
      const count = payments.filter(p => normEmail(p.dispatcher_email) === email).length
      const created = await createDispatcherPayment({
        session, toast, user, orders: ords, commissionPct: rateOf(email), paymentNumber: count + 1,
        union: { id: union.id, group },
      })
      if (!created) break
      done++
    }
    if (done === Object.keys(byMember).length) toast.success('Pago registrado correctamente')
    else toast.error('El pago quedo incompleto: revisa el historial')
    setShowNew(false)
    setSelectedIds(new Set())
    await fetchData()
    setSaving(false)
  }

  // Each dispatcher gets HIS settlement (his loads, his %) by email
  async function sendGroup(g) {
    setSendingKey(g.key)
    let sent = 0
    try {
      toast.info('Generando y enviando los settlements...')
      for (const p of g.payments) {
        const user = userByEmail[normEmail(p.dispatcher_email)] || { email: p.dispatcher_email, user_metadata: { name: p.dispatcher_name } }
        await emailSettlement(p, user)
        sent++
      }
      toast.success(`Settlements enviados (${sent})`)
    } catch (e) {
      toast.error(`Error al enviar (${sent} de ${g.payments.length} enviados): ${e.message}`)
    }
    setSendingKey(null)
    await fetchData()
  }

  async function removeGroup(g) {
    const ok = await toast.confirm('¿Eliminar este pago? Tambien se eliminaran los gastos registrados en los camiones correspondientes.')
    if (!ok) return
    for (const p of g.payments) await deleteDispatcherPayment({ session, payment: p })
    await fetchData()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 animate-modal-backdrop">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-modal-panel">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800 shrink-0 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center text-white shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight truncate">{union.name}</h2>
              <p className="text-xs text-gray-500 truncate">Unión de dispatchers · pagos combinados</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setShowNew(v => !v); setSelectedIds(new Set()) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${showNew ? 'bg-gray-700 text-gray-300' : 'bg-orange-600 text-white hover:bg-orange-500'}`}
            >
              {showNew ? 'Historial' : '+ Nuevo'}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* History */}
          <div className={`flex-col overflow-hidden ${showNew ? 'hidden lg:flex lg:flex-1 lg:border-r lg:border-gray-800' : 'flex flex-1'}`}>
            <div className="px-5 py-3 border-b border-gray-800 shrink-0 flex items-center justify-between">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Historial de Pagos</p>
              <span className="text-[10px] text-gray-600">{groups.length} registro{groups.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : groups.length === 0 ? (
                <div className="text-center py-24">
                  <p className="text-gray-500 text-sm font-medium">Sin pagos registrados</p>
                  <p className="text-gray-600 text-xs mt-1">Presiona <span className="text-orange-400 font-bold">+ Nuevo</span> para registrar el primer pago</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.map(g => (
                    <div key={g.key} className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-colors">
                      <div className="flex items-start gap-3 cursor-pointer" onClick={() => toggleGroup(g)}>
                        <div className="w-9 h-9 rounded-lg bg-orange-600/15 border border-orange-600/25 flex items-center justify-center shrink-0">
                          <span className="text-orange-400 text-[11px] font-bold">#{g.number}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-base font-bold text-green-400">{fmt(g.payout)}</p>
                            {g.sentAll && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800/40 font-semibold">Enviado</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Gross: <span className="text-gray-300">{fmt(g.gross)}</span>
                            <span className="mx-1.5 text-gray-700">·</span>
                            {g.orderIds.length} orden{g.orderIds.length !== 1 ? 'es' : ''}
                          </p>
                          {(g.periodStart || g.periodEnd) && <p className="text-[10px] text-gray-600 mt-1">{fmtDate(g.periodStart)} — {fmtDate(g.periodEnd)}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <p className="text-xs text-gray-500">{fmtDate(g.payDate)}</p>
                          <svg className={`w-4 h-4 text-gray-600 transition-transform ${expandedKey === g.key ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </div>
                      </div>

                      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: expandedKey === g.key ? '1fr' : '0fr' }}>
                        <div className="overflow-hidden px-1">
                          <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5">
                            {groupOrders[g.key] === 'loading' ? (
                              <div className="flex justify-center py-3"><div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" /></div>
                            ) : (groupOrders[g.key] || []).length === 0 ? (
                              <p className="text-xs text-gray-600 py-1">Sin ordenes</p>
                            ) : (groupOrders[g.key] || []).map(o => (
                              <div
                                key={o.id}
                                ref={o.id === highlightOrderId ? highlightRef : undefined}
                                onClick={() => navigate(`/orders/${o.id}`)}
                                className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-1.5 cursor-pointer transition-all hover:bg-gray-800/70 ${o.id === highlightOrderId ? 'bg-orange-600/20 ring-2 ring-orange-500/70' : 'bg-gray-800/40'}`}
                              >
                                <span className="text-gray-200 font-medium shrink-0">{o.order_number}</span>
                                <span className="text-gray-500 truncate flex-1 text-center">{o.pu_city} → {o.do_city}</span>
                                <span className="text-gray-600 shrink-0">{fmtShort(o.pu_date)}</span>
                                <span className="text-gray-300 font-medium shrink-0">{fmt(o.rate)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-800">
                        <button
                          onClick={() => sendGroup(g)}
                          disabled={sendingKey === g.key}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
                        >
                          {sendingKey === g.key && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
                          Enviar settlements
                        </button>
                        {canDelete(session) && (
                          <button onClick={() => removeGroup(g)} title="Eliminar" className="ml-auto w-7 h-7 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-600/10 rounded-lg transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* New payment */}
          {showNew && (
            <div className="flex-1 lg:flex-none lg:w-[380px] lg:shrink-0 flex flex-col overflow-hidden bg-gray-900/30 animate-panel-stretch-in">
              <div className="px-5 py-4 border-b border-gray-800 shrink-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-3">Nuevo Pago</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-800/70 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-1">Gross</p>
                    <p className="text-sm font-bold text-white">{fmt(gross)}</p>
                  </div>
                  <div className="bg-orange-600/15 border border-orange-600/30 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-orange-400 uppercase tracking-wide mb-1">Pago total</p>
                    <p className="text-sm font-bold text-orange-400">{fmt(payout)}</p>
                  </div>
                </div>
                {orders.length > 0 && (
                  <button onClick={toggleAll} className="mt-2.5 w-full text-xs text-gray-500 hover:text-gray-300 transition-colors text-left">
                    {selectedIds.size === orders.length ? 'Deseleccionar todas' : `Seleccionar todas (${orders.length})`}
                    <span className="float-right text-orange-400">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {orders.length === 0 && blockedOrders.length === 0 ? (
                  <div className="text-center py-16 text-gray-600 text-sm">Sin órdenes disponibles<br /><span className="text-xs text-gray-700">Todas las órdenes ya tienen pago</span></div>
                ) : (
                  <>
                    {orders.map(o => {
                      const isSelected = selectedIds.has(o.id)
                      return (
                        <button
                          key={o.id}
                          onClick={() => toggleOrder(o.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${isSelected ? 'bg-orange-600/10 border-orange-600/35' : 'border-transparent hover:bg-gray-800/60 hover:border-gray-700/50'}`}
                        >
                          <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-orange-600 border-orange-600' : 'border-gray-600'}`}>
                            {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-white truncate">{o.order_number || o.id.slice(0, 8)}</span>
                              <span className="text-xs font-bold text-green-400 shrink-0">{fmt(o.rate || 0)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-500 truncate">{o.pu_city || '—'} → {o.do_city || '—'}</span>
                              <span className="text-[10px] text-gray-600 shrink-0">{fmtShort(o.pu_date)}</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}

                    {blockedOrders.length > 0 && (
                      <>
                        {orders.length > 0 && <div className="h-px bg-gray-800/80 my-2" />}
                        <p className="text-[9px] text-gray-600 uppercase tracking-widest font-semibold px-1 pb-1">Pendientes de pago ({blockedOrders.length})</p>
                        {blockedOrders.map(o => (
                          <div
                            key={o.id}
                            onClick={superAdmin ? () => handleBlockedClick(o) : undefined}
                            title={superAdmin ? 'Carga no pagada — click para incluir de todas formas' : 'Carga aun no ha sido pagada'}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-gray-800 select-none ${superAdmin ? 'opacity-70 cursor-pointer hover:opacity-100 hover:border-amber-700/50' : 'opacity-45 cursor-not-allowed'}`}
                          >
                            <svg className={`w-3.5 h-3.5 shrink-0 ${superAdmin ? 'text-amber-500' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-gray-500 truncate">{o.order_number || o.id.slice(0, 8)}</span>
                                <span className="text-xs font-bold text-gray-600 shrink-0">{fmt(o.rate || 0)}</span>
                              </div>
                              <span className="text-[10px] text-gray-600 truncate">{o.pu_city || '—'} → {o.do_city || '—'}</span>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="px-5 py-4 border-t border-gray-800 shrink-0">
                <button
                  onClick={savePayment}
                  disabled={saving || !selectedIds.size}
                  className="w-full py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Guardando...' : `Guardar Pago${selectedIds.size > 0 ? ` (${fmt(payout)})` : ''}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
