import { cleanAdjustments } from '../../api/_adjustments.js'

// + / − on a dispatcher or driver payment: a debt deducted from the settlement
// ('deduct') or extra income added to it ('add'). The payout saved is
// earned + adjustments; the truck's expense stays what the loads earned.
// Stored in dispatcher_payments/driver_payments.adjustments (042_payment_adjustments.sql).


const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

/** Editor for a new payment. `value`: [{ type, description, amount }] (amount as typed). */
export function AdjustmentsEditor({ value, onChange }) {
  const add = type => onChange([...value, { type, description: '', amount: '' }])
  const update = (i, field, v) => onChange(value.map((a, j) => (j === i ? { ...a, [field]: v } : a)))
  const remove = i => onChange(value.filter((_, j) => j !== i))

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold flex-1">Ajustes</span>
        <button
          type="button"
          onClick={() => add('deduct')}
          title="Descontar del pago (deuda, préstamo, multa...)"
          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-lg border border-red-700/50 bg-red-900/20 text-red-300 text-xs font-semibold hover:bg-red-900/40 transition-colors"
        >
          <span className="text-sm leading-none">−</span> Descontar
        </button>
        <button
          type="button"
          onClick={() => add('add')}
          title="Sumar al pago (bono, reembolso, extra...)"
          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-lg border border-emerald-700/50 bg-emerald-900/20 text-emerald-300 text-xs font-semibold hover:bg-emerald-900/40 transition-colors"
        >
          <span className="text-sm leading-none">+</span> Agregar
        </button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {value.map((a, i) => (
            <div key={i} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 animate-tab-in ${a.type === 'add' ? 'border-emerald-800/50 bg-emerald-900/10' : 'border-red-800/50 bg-red-900/10'}`}>
              <span className={`w-4 text-center text-sm font-bold shrink-0 ${a.type === 'add' ? 'text-emerald-400' : 'text-red-400'}`}>{a.type === 'add' ? '+' : '−'}</span>
              <input
                value={a.description}
                onChange={e => update(i, 'description', e.target.value)}
                placeholder={a.type === 'add' ? 'Ej: Bono, reembolso' : 'Ej: Deuda préstamo'}
                maxLength={120}
                className="flex-1 min-w-0 bg-transparent text-xs text-gray-100 placeholder-gray-600 focus:outline-none"
                autoFocus={i === value.length - 1 && !a.description}
              />
              <span className="text-xs text-gray-500">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={a.amount}
                onChange={e => update(i, 'amount', e.target.value)}
                placeholder="0.00"
                className="w-20 bg-gray-800/70 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-right text-gray-100 focus:outline-none focus:border-orange-500"
              />
              <button type="button" onClick={() => remove(i)} className="p-0.5 text-gray-600 hover:text-red-400" aria-label="Quitar ajuste">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Small "Ganado $X · − Deuda $100 · + Bono $50" breakdown under the payout card. */
export function AdjustmentsBreakdown({ earned, adjustments, className = '' }) {
  const list = cleanAdjustments(adjustments)
  if (!list.length) return null
  return (
    <div className={`text-[11px] space-y-0.5 ${className}`}>
      <div className="flex justify-between text-gray-500"><span>Ganado por las cargas</span><span className="tabular-nums">{fmt(earned)}</span></div>
      {list.map((a, i) => (
        <div key={i} className={`flex justify-between gap-2 ${a.type === 'add' ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className="truncate">{a.type === 'add' ? '+' : '−'} {a.description || (a.type === 'add' ? 'Extra' : 'Descuento')}</span>
          <span className="tabular-nums shrink-0">{a.type === 'add' ? '+' : '−'}{fmt(a.amount)}</span>
        </div>
      ))}
    </div>
  )
}

