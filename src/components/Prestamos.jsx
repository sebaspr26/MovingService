import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { isSuperAdmin } from '../lib/permissions'
import { fmt } from '../lib/orders'
import { readPageCache, writePageCache, loadAuthUsers } from '../lib/pageCache'
import {
  canSeePrestamos, loadCajaData, cajaOf, createMovement, decideMovement, cancelMovement, sendRemaining, KIND_LABEL,
} from '../lib/prestamos'
import { useToast, friendlyError } from './Toast'
import Avatar, { kindOfRole } from './Avatar'
import InfoTip from './InfoTip'

// Préstamos — only for companies with the feature (Dacrisam). Dispatchers and
// admins see their own caja; the super admin sees every caja, approves loans
// and deposits and marks commission payments as sent. Math in lib/prestamos.js.

const shortDate = s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${m}/${d}/${y.slice(2)}` }
const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`

// ── Count-up numbers, like the rest of the app ──
function useCountUp(target, duration = 800) {
  // No animation with reduced motion, or in a hidden tab (it would sit at 0 until shown)
  const still = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden)
  const [value, setValue] = useState(still ? target : 0)
  const prev = useRef(still ? target : 0)
  useEffect(() => {
    const from = prev.current
    if (from === target) return
    let raf
    const start = performance.now()
    const tick = now => {
      const t = Math.min((now - start) / duration, 1)
      setValue(from + (target - from) * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
      else { prev.current = target; setValue(target) }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); prev.current = target }
  }, [target, duration])
  return value
}
const Money = ({ value }) => <>{fmt(useCountUp(Number(value) || 0))}</>

// label(you): text for the user himself (true) or for the super admin
function balanceTone(balance) {
  if (balance > 0.004) return { text: 'text-emerald-400', label: you => you ? 'Tu dinero guardado en la empresa' : 'Guardado en la empresa' }
  if (balance < -0.004) return { text: 'text-red-400', label: you => you ? 'Le debes a la empresa' : 'Le debe a la empresa' }
  return { text: 'text-gray-300', label: () => 'Caja en cero' }
}

const STATUS_CHIP = {
  pending: { label: 'Pendiente', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  approved: { label: 'Aprobado', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rejected: { label: 'Rechazado', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
}

export default function Prestamos() {
  const { session } = useAuth()
  const { activeCompany, loading } = useCompany()
  if (loading || !activeCompany) return null
  if (!canSeePrestamos(session, activeCompany)) return <Navigate to="/" replace />
  return isSuperAdmin(session) ? <SuperView company={activeCompany} /> : <SelfView company={activeCompany} />
}

/** Company data (payments + movements), shown right away from the last visit. */
function useCajaData(company, session, email = null) {
  const cacheKey = email || 'all'
  const [data, setData] = useState(() => readPageCache('prestamos', session, cacheKey))
  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast })
  const fetchData = useCallback(() => loadCajaData(company.id, email)
    .then(d => { writePageCache('prestamos', session, d, cacheKey); return d }), [company.id, email, session, cacheKey])
  useEffect(() => {
    let alive = true
    fetchData().then(d => { if (alive) setData(d) }).catch(err => toastRef.current.error(friendlyError(err.message)))
    return () => { alive = false }
  }, [fetchData])
  const reload = useCallback(async () => {
    try {
      setData(await fetchData())
    } catch (err) {
      toastRef.current.error(friendlyError(err.message))
    }
  }, [fetchData])
  return [data, reload]
}

// ─────────────── Dispatcher / admin: their own caja ───────────────

function SelfView({ company }) {
  const { session } = useAuth()
  const user = { email: session.user.email, name: session.user.user_metadata?.name || session.user.email, role: session.user.user_metadata?.role }
  const [data, reload] = useCajaData(company, session, user.email)
  return (
    <div className="animate-tab-in max-w-5xl">
      <Header subtitle="Tu caja: lo que entra (tus pagos) menos lo que se te envía" />
      {!data ? <Spinner /> : <CajaPanel company={company} user={user} caja={cajaOf(user.email, data)} isSuper={false} onChanged={reload} />}
    </div>
  )
}

// ─────────────── Super admin: every caja + approvals ───────────────

function SuperView({ company }) {
  const { session } = useAuth()
  const toast = useToast()
  const [data, reload] = useCajaData(company, session)
  const [users, setUsers] = useState(() => readPageCache('prestamos-users', session) || null)
  const [openEmail, setOpenEmail] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    loadAuthUsers().then(({ users: all = [] }) => {
      // Same rule as Pago Dispatchers: dispatchers/admins assigned to this company
      const list = all
        .filter(u => ['dispatcher', 'admin'].includes(u.user_metadata?.role) && u.email)
        .filter(u => (u.user_metadata?.allowed_companies || []).includes(company.id))
        .map(u => ({ email: u.email.toLowerCase(), name: u.user_metadata?.name || u.email, role: u.user_metadata?.role, avatar: u.user_metadata?.avatar_path || null }))
      writePageCache('prestamos-users', session, list)
      setUsers(list)
    }).catch(() => setUsers(prev => prev || []))
  }, [company.id, session])

  if (!data || !users) return <div className="animate-tab-in"><Header /><Spinner /></div>

  // Anyone with payments or movements here also gets a caja (e.g. a user since removed)
  const byEmail = new Map(users.map(u => [u.email, u]))
  for (const p of data.payments) {
    const e = String(p.dispatcher_email || '').toLowerCase()
    if (e && !byEmail.has(e)) byEmail.set(e, { email: e, name: p.dispatcher_name || e, role: 'dispatcher', noAccount: true })
  }
  for (const m of data.movements) if (!byEmail.has(m.user_email)) byEmail.set(m.user_email, { email: m.user_email, name: m.user_name || m.user_email, role: 'dispatcher', noAccount: true })
  const cajas = [...byEmail.values()]
    .map(u => ({ user: u, caja: cajaOf(u.email, data) }))
    .sort((a, b) => a.user.name.localeCompare(b.user.name))

  const open = openEmail && cajas.find(c => c.user.email === openEmail)
  if (open) {
    return (
      <div className="animate-tab-in max-w-5xl">
        <button onClick={() => setOpenEmail(null)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          Todas las cajas
        </button>
        <CajaPanel company={company} user={open.user} caja={open.caja} isSuper onChanged={reload} />
      </div>
    )
  }

  const income = cajas.reduce((s, c) => s + c.caja.earned + c.caja.deposits, 0)
  const outgo = cajas.reduce((s, c) => s + c.caja.sent + c.caja.loans, 0)
  const inCaja = cajas.reduce((s, c) => s + c.caja.balance, 0)
  const pending = cajas.flatMap(c => c.caja.pending.map(m => ({ ...m, user: c.user })))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))

  async function decide(m, approve) {
    const what = m.kind === 'payout' ? 'el envío' : m.kind === 'loan' ? 'el préstamo' : 'el abono'
    const ok = await toast.confirm(`¿${approve ? 'Aprobar' : 'Rechazar'} ${what} de ${fmt(m.amount)} para ${m.user.name}?`, { confirmText: approve ? 'Aprobar' : 'Rechazar' })
    if (!ok) return
    setBusyId(m.id)
    try {
      await decideMovement(session, m, approve)
      toast.success(approve ? ({ payout: 'Envío registrado', loan: 'Préstamo aprobado', deposit: 'Abono confirmado' })[m.kind] : 'Solicitud rechazada')
      await reload()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="animate-tab-in">
      <Header subtitle="La caja de cada dispatcher y admin: lo que se les debe, préstamos y abonos" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Tile label="Entró" value={income} tone="text-emerald-400" />
        <Tile label="Se envió" value={outgo} tone="text-red-400" />
        <Tile label="En cajas" value={inCaja} tone={inCaja < 0 ? 'text-red-400' : 'text-white'} />
        <Tile label="Por aprobar" count={pending.length} tone={pending.length ? 'text-yellow-400' : 'text-gray-300'} />
      </div>

      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-yellow-400 font-semibold mb-2">Por aprobar</h2>
          <div className="space-y-2">
            {pending.map(m => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
                <Avatar name={m.user.name} kind={kindOfRole(m.user.role)} size={36} />
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm text-white font-medium">{m.user.name}</p>
                  <p className="text-xs text-gray-400">
                    {REQUEST_LABEL[m.kind](false)} · {shortDate(m.created_at)}{m.note ? ` · “${m.note}”` : ''}
                  </p>
                </div>
                <p className={`text-base font-bold tabular-nums ${m.kind === 'deposit' ? 'text-emerald-400' : 'text-red-400'}`}>{m.kind === 'deposit' ? '+' : '−'}{fmt(m.amount)}</p>
                <div className="flex gap-2">
                  <button onClick={() => decide(m, false)} disabled={busyId === m.id} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50">Rechazar</button>
                  <button onClick={() => decide(m, true)} disabled={busyId === m.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
                    {APPROVE_LABEL[m.kind]}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Cajas</h2>
      {cajas.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">No hay dispatchers ni admins en esta empresa.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {cajas.map(({ user, caja }) => {
            const tone = balanceTone(caja.balance)
            return (
              <button key={user.email} onClick={() => setOpenEmail(user.email)}
                className="text-left rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-800/60 hover:border-gray-700 transition-colors p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={user.name} kind={user.noAccount ? 'inactive' : kindOfRole(user.role)} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-gray-500">{user.noAccount ? 'Sin cuenta' : user.role === 'admin' ? 'Admin' : 'Dispatcher'}</p>
                  </div>
                </div>
                <p className="mt-3 text-[10px] uppercase tracking-wider text-gray-500">En caja</p>
                <p className={`text-2xl font-bold tabular-nums ${tone.text}`}><Money value={caja.balance} /></p>
                <p className="text-[11px] text-gray-500 tabular-nums">Entró {fmt(caja.earned + caja.deposits)} · Se envió {fmt(caja.sent + caja.loans)}</p>
                {caja.pending.length > 0 && (
                  <div className="mt-2"><Chip cls="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">{caja.pending.length} por aprobar</Chip></div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────── One caja (shared by both views) ───────────────

function CajaPanel({ company, user, caja, isSuper, onChanged }) {
  const { session } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('ingresos')
  const [modal, setModal] = useState(null) // { kind, payment? }
  const [busy, setBusy] = useState(null)
  const tone = balanceTone(caja.balance)
  const leftInPayments = caja.toSend.reduce((s, p) => s + p.remaining, 0)
  const you = !isSuper

  async function run(key, fn, okMsg) {
    setBusy(key)
    try {
      await fn()
      if (okMsg) toast.success(okMsg)
      await onChanged()
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setBusy(null)
    }
  }

  async function sendAllLeft() {
    const ok = await toast.confirm(`¿Marcar como enviado todo lo que queda de sus pagos (${fmt(leftInPayments)} en ${caja.toSend.length} pago${caja.toSend.length > 1 ? 's' : ''})? Úsalo para pagos que ya le hiciste por fuera. Su caja baja en ese monto.`, { confirmText: 'Marcar enviado' })
    if (!ok) return
    run('all', () => sendRemaining(session, company.id, user, caja.toSend), 'Marcado como enviado')
  }

  async function decide(m, approve) {
    const what = m.kind === 'payout' ? 'el envío' : m.kind === 'loan' ? 'el préstamo' : 'el abono'
    const ok = await toast.confirm(`¿${approve ? 'Aprobar' : 'Rechazar'} ${what} de ${fmt(m.amount)}?`, { confirmText: approve ? 'Aprobar' : 'Rechazar' })
    if (!ok) return
    run(m.id, () => decideMovement(session, m, approve), approve ? 'Aprobado' : 'Rechazado')
  }

  async function cancel(m) {
    const ok = await toast.confirm(`¿Cancelar tu solicitud de ${KIND_LABEL[m.kind].toLowerCase()} por ${fmt(m.amount)}?`, { confirmText: 'Cancelar solicitud' })
    if (!ok) return
    run(m.id, () => cancelMovement(session, m), 'Solicitud cancelada')
  }

  return (
    <div className="space-y-5">
      {/* In / out / in caja */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex flex-wrap items-start gap-4">
          {isSuper && <Avatar name={user.name} kind={user.noAccount ? 'inactive' : kindOfRole(user.role)} size={48} />}
          <div className="flex-1 min-w-[180px]">
            {isSuper && <p className="text-sm font-semibold text-white">{user.name}</p>}
            <p className="text-[11px] uppercase tracking-wider text-gray-500 mt-0.5">En caja</p>
            <p className={`text-3xl sm:text-4xl font-bold tabular-nums ${tone.text}`}><Money value={caja.balance} /></p>
            <p className="text-xs text-gray-500 mt-0.5">{tone.label(you)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModal({ kind: 'payout' })} className="px-3 py-2 rounded-lg text-sm font-semibold bg-orange-600 text-white hover:bg-orange-500">
              {isSuper ? 'Enviar dinero' : 'Pedir envío'}
            </button>
            <button onClick={() => setModal({ kind: 'loan' })} className="px-3 py-2 rounded-lg text-sm font-medium border border-red-500/30 text-red-300 hover:bg-red-500/10">
              {isSuper ? 'Registrar préstamo' : 'Solicitar préstamo'}
            </button>
            <button onClick={() => setModal({ kind: 'deposit' })} className="px-3 py-2 rounded-lg text-sm font-medium border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
              Registrar abono
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Mini label="Entró (pagos)" value={caja.earned} />
          <Mini label="Se envió" value={-caja.sent} />
          <Mini label="Préstamos" value={-caja.loans} />
          <Mini label="Abonos" value={caja.deposits} />
        </div>
        {isSuper && caja.toSend.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs rounded-lg bg-gray-800/50 text-gray-400 px-3 py-2">
            <span className="flex-1">¿Ya le pagaste por fuera lo de pagos anteriores? Márcalo de una vez ({fmt(leftInPayments)} en {caja.toSend.length} pago{caja.toSend.length > 1 ? 's' : ''}).</span>
            <button onClick={sendAllLeft} disabled={!!busy} className="px-2.5 py-1 rounded-md bg-gray-700/60 text-gray-200 hover:bg-gray-700 font-medium disabled:opacity-50">
              {busy === 'all' ? 'Marcando...' : 'Marcar todo como enviado'}
            </button>
          </div>
        )}
      </div>

      {/* Pending requests */}
      {caja.pending.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-yellow-400 font-semibold mb-2">{isSuper ? 'Por aprobar' : 'Esperando aprobación'}</h3>
          <div className="space-y-2">
            {caja.pending.map(m => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm text-white font-medium">{REQUEST_LABEL[m.kind](you)}</p>
                  <p className="text-xs text-gray-400">{shortDate(m.created_at)}{m.note ? ` · “${m.note}”` : ''}</p>
                </div>
                <p className={`text-base font-bold tabular-nums ${m.kind === 'deposit' ? 'text-emerald-400' : 'text-red-400'}`}>{m.kind === 'deposit' ? '+' : '−'}{fmt(m.amount)}</p>
                {isSuper ? (
                  <div className="flex gap-2">
                    <button onClick={() => decide(m, false)} disabled={busy === m.id} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50">Rechazar</button>
                    <button onClick={() => decide(m, true)} disabled={busy === m.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">{APPROVE_LABEL[m.kind]}</button>
                  </div>
                ) : (
                  <button onClick={() => cancel(m)} disabled={busy === m.id} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50">Cancelar</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Incoming payments / history */}
      <section>
        <div className="flex gap-1 border-b border-gray-800 mb-3">
          {[['ingresos', `Ingresos (${caja.payments.length})`], ['historial', 'Historial']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-orange-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'historial' ? <History caja={caja} /> : <Payments caja={caja} isSuper={isSuper} onSend={p => setModal({ kind: 'payout', payment: p })} />}
      </section>

      {modal && (
        <MovementModal
          kind={modal.kind}
          payment={modal.payment || null}
          balance={caja.balance}
          isSuper={isSuper}
          user={user}
          onClose={() => setModal(null)}
          onSubmit={async ({ amount, note }) => {
            await createMovement(session, company.id, { kind: modal.kind, user, amount, note, approve: isSuper, payment: modal.payment || null })
            toast.success(isSuper ? DONE_LABEL[modal.kind] : REQUESTED_LABEL[modal.kind])
            setModal(null)
            await onChanged()
          }}
        />
      )}
    </div>
  )
}

const REQUEST_LABEL = {
  payout: you => you ? 'Pediste un envío' : 'Pide que le envíen',
  loan: you => you ? 'Pediste un préstamo' : 'Pide un préstamo',
  deposit: you => you ? 'Reportaste un abono' : 'Dice que abonó',
}
const APPROVE_LABEL = { payout: 'Enviado', loan: 'Aprobar', deposit: 'Confirmar' }
const DONE_LABEL = { payout: 'Envío registrado', loan: 'Préstamo registrado', deposit: 'Abono registrado' }
const REQUESTED_LABEL = {
  payout: 'Envío pedido: queda pendiente hasta que te lo envíen',
  loan: 'Préstamo solicitado: queda pendiente de aprobación',
  deposit: 'Abono reportado: queda pendiente de confirmación',
}

function History({ caja }) {
  if (!caja.history.length) return <p className="text-sm text-gray-500 text-center py-10">Todavía no hay movimientos.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase text-gray-500 border-b border-gray-800">
          <th className="text-left py-2 pr-3">Fecha</th><th className="text-left pr-3">Movimiento</th>
          <th className="text-right pr-3 sm:pr-3">Monto</th><th className="text-right hidden sm:table-cell">Caja</th>
        </tr></thead>
        <tbody>
          {caja.history.map(h => {
            const chip = h.status !== 'approved' && STATUS_CHIP[h.status]
            const m = h.movement
            return (
              <tr key={h.id} className={`border-b border-gray-800/60 ${h.status === 'rejected' ? 'opacity-50' : ''}`}>
                <td className="py-2 pr-3 text-gray-400 tabular-nums whitespace-nowrap">{shortDate(h.date)}</td>
                <td className="py-2 pr-3">
                  <span className="text-gray-200">{h.label}</span>
                  {chip && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border ${chip.cls}`}>{chip.label}</span>}
                  {h.payment && <span className="block text-[11px] text-gray-500">Periodo {shortDate(h.payment.period_start)} – {shortDate(h.payment.period_end)}</span>}
                  {m?.note && m.kind !== 'payout' && <span className="block text-[11px] text-gray-500">“{m.note}”</span>}
                  {m?.decided_by_name && m.status !== 'pending' && <span className="block text-[11px] text-gray-600">{m.status === 'rejected' ? 'Rechazado' : m.kind === 'payout' ? 'Enviado' : 'Aprobado'} por {m.decided_by_name}</span>}
                </td>
                <td className={`py-2 sm:pr-3 text-right tabular-nums font-medium whitespace-nowrap ${h.status !== 'approved' ? 'text-gray-500' : h.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {signed(h.amount)}
                  {/* Phones: the caja after this movement goes under the amount */}
                  {h.balance != null && <span className={`block sm:hidden text-[11px] font-normal ${h.balance < 0 ? 'text-red-300/80' : 'text-gray-500'}`}>Caja {fmt(h.balance)}</span>}
                </td>
                <td className={`py-2 text-right tabular-nums hidden sm:table-cell ${h.balance == null ? 'text-gray-600' : h.balance < 0 ? 'text-red-300' : 'text-gray-300'}`}>{h.balance == null ? '—' : fmt(h.balance)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Payments({ caja, isSuper, onSend }) {
  if (!caja.payments.length) return <p className="text-sm text-gray-500 text-center py-10">Todavía no han entrado pagos.</p>
  return (
    <div className="space-y-2">
      {caja.payments.map(p => {
        const total = Number(p.payout) || 0
        const pct = total ? Math.min(p.sentAmount / total, 1) * 100 : 0
        return (
          <div key={p.id} className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-[120px]">
                <p className="text-sm text-gray-200 font-medium">Pago #{p.payment_number}</p>
                <p className="text-[11px] text-gray-500">{shortDate(p.pay_date)} · {shortDate(p.period_start)} – {shortDate(p.period_end)}</p>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2 min-w-[240px] text-right">
                <div><p className="text-[10px] uppercase text-gray-500">Entró</p><p className="text-sm tabular-nums text-gray-100 font-medium">{fmt(total)}</p></div>
                <div><p className="text-[10px] uppercase text-gray-500">Se envió</p><p className="text-sm tabular-nums text-red-300">{p.sentAmount ? `−${fmt(p.sentAmount)}` : fmt(0)}</p></div>
                <div><p className="text-[10px] uppercase text-gray-500">Queda</p><p className={`text-sm tabular-nums font-semibold ${p.remaining > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>{fmt(p.remaining)}</p></div>
              </div>
              {isSuper && (p.remaining > 0 ? (
                <button onClick={() => onSend(p)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-600/90 text-white hover:bg-orange-500">Enviar</button>
              ) : (
                <span className="text-xs text-gray-500 w-[58px] text-center">Enviado</span>
              ))}
            </div>
            {/* How much of it went out */}
            <div className="mt-2 h-1 rounded-full bg-emerald-500/20 overflow-hidden"><div className="h-full bg-red-400/70" style={{ width: `${pct}%` }} /></div>
          </div>
        )
      })}
    </div>
  )
}

function MovementModal({ kind, payment, balance, isSuper, user, onClose, onSubmit }) {
  // Sending from a payment: starts with what's left of it
  const [amount, setAmount] = useState(payment ? String(payment.remaining) : '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const value = Number(amount)
  const valid = Number.isFinite(value) && value > 0
  const after = kind === 'deposit' ? balance + (valid ? value : 0) : balance - (valid ? value : 0)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onSubmit({ amount: value, note })
    } catch (err) {
      toast.error(friendlyError(err.message))
      setSaving(false)
    }
  }

  const who = isSuper ? user.name : 'tú'
  const copy = {
    payout: {
      title: isSuper ? 'Enviar dinero' : 'Pedir envío',
      help: isSuper
        ? `Lo que le mandas a ${user.name}. Sale de su caja; lo demás se queda ahí.`
        : 'Pídele al super admin que te envíe parte de tu caja. Queda pendiente hasta que te lo envíe.',
      button: isSuper ? 'Enviar' : 'Pedir', cls: 'bg-orange-600 hover:bg-orange-500', placeholder: 'Ej: Zelle 10/14',
    },
    loan: {
      title: isSuper ? 'Registrar préstamo' : 'Solicitar préstamo',
      help: isSuper ? `Dinero prestado a ${user.name}. Sale de su caja (puede quedar negativa).` : 'Dinero adelantado aunque no tengas en caja. Queda pendiente hasta que el super admin lo apruebe.',
      button: isSuper ? 'Registrar' : 'Solicitar', cls: 'bg-red-600 hover:bg-red-500', placeholder: 'Ej: adelanto de quincena',
    },
    deposit: {
      title: 'Registrar abono',
      help: isSuper ? `Dinero que ${user.name} le entregó a la empresa por fuera. Entra a su caja.` : 'Dinero que le entregaste a la empresa por fuera de la app. Queda pendiente hasta que el super admin confirme que lo recibió.',
      button: isSuper ? 'Registrar' : 'Reportar', cls: 'bg-emerald-600 hover:bg-emerald-500', placeholder: 'Ej: transferencia 10/14',
    },
  }[kind]

  return createPortal(
    <div className="fixed inset-0 bg-black/70 z-[120] flex items-center justify-center p-4 animate-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-modal-panel" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5">
          <h3 className="text-base font-bold text-white">{copy.title}{payment ? ` · pago #${payment.payment_number}` : ''}</h3>
          <p className="text-xs text-gray-500 mt-1">{copy.help}</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <label className="block">
            <span className="block text-xs text-gray-400 mb-1.5">Monto (USD){payment ? ` — quedan ${fmt(payment.remaining)} de este pago` : ''}</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input autoFocus type="number" inputMode="decimal" min="0" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500" placeholder="0.00" />
            </div>
          </label>
          {/* What the caja looks like after this */}
          <div className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2 text-xs">
            <span className="text-gray-500">En caja {who === 'tú' ? 'tienes' : 'tiene'} <span className="text-gray-200 tabular-nums">{fmt(balance)}</span></span>
            <span className="text-gray-500">→ queda <span className={`tabular-nums font-semibold ${after < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{fmt(after)}</span></span>
          </div>
          <label className="block">
            <span className="block text-xs text-gray-400 mb-1.5">Nota (opcional)</span>
            <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} maxLength={200}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
              placeholder={copy.placeholder} />
          </label>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={!valid || saving}
            className={`flex-1 px-4 py-2.5 text-white rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 ${copy.cls}`}>
            {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Guardando...' : copy.button}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Small pieces ──

function Header({ subtitle }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2"><h1 className="text-xl sm:text-2xl font-bold text-white">Préstamos</h1><InfoTip id="prestamos.page" /></div>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function Tile({ label, value, count, tone }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{count != null ? count : <Money value={value} />}</p>
    </div>
  )
}

function Mini({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-800/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 truncate">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${value < 0 ? 'text-red-300' : value > 0 ? 'text-emerald-300' : 'text-gray-300'}`}>{signed(useCountUp(value))}</p>
    </div>
  )
}

const Chip = ({ cls, children }) => <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>

function Spinner() {
  return <div className="flex justify-center py-24"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
}
