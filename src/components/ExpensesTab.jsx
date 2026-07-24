import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, friendlyError } from './Toast'
import AddReceiptModal from './AddReceiptModal'

const PAGE_SIZE = 5

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'diesel', label: 'Diesel' },
  { key: 'def', label: 'DEF' },
  { key: 'chofer', label: 'Pago Chofer' },
  { key: 'expense', label: 'Otros Gastos' },
]

export default function ExpensesTab({ truckId, period, cycle, onDataChange, readOnly, isLis }) {
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [dieselRows, setDieselRows] = useState([])
  const [defRows, setDefRows] = useState([])
  const [expenseRows, setExpenseRows] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { fetchAll() }, [truckId, cycle?.id, period])
  useEffect(() => { setExpanded(false) }, [period])

  async function fetchAll() {
    if (!cycle?.id) return
    const [diesel, def, expenses] = await Promise.all([
      supabase.from('diesel').select('*').eq('truck_id', truckId)
        .eq('cycle_id', cycle.id).order('date'),
      supabase.from('def').select('*').eq('truck_id', truckId)
        .eq('cycle_id', cycle.id).order('date'),
      supabase.from('expenses').select('*').eq('truck_id', truckId)
        .eq('cycle_id', cycle.id).order('date'),
    ])
    // Sub-filter by week if a week is selected
    const weekFilter = (arr) => {
      if (period.start === cycle.start_date) return arr
      return (arr || []).filter(r => r.date >= period.start && r.date <= period.end)
    }
    setDieselRows(weekFilter(diesel.data || []))
    setDefRows(weekFilter(def.data || []))
    setExpenseRows(weekFilter(expenses.data || []))
  }

  // Normalize all rows into common format
  const allRows = [
    ...dieselRows.map(r => ({ ...r, _type: 'diesel', _amount: Number(r.value) || 0, _desc: `${Number(r.gallons).toFixed(1)} gal` })),
    ...defRows.map(r => ({ ...r, _type: 'def', _amount: Number(r.value) || 0, _desc: `${Number(r.gallons).toFixed(1)} gal` })),
    ...expenseRows.filter(r => r.category === 'Pago Chofer').map(r => ({ ...r, _type: 'chofer', _amount: Number(r.amount) || 0, _desc: r.description })),
    ...expenseRows.filter(r => r.category !== 'Pago Chofer').map(r => ({ ...r, _type: 'expense', _amount: Number(r.amount) || 0, _desc: r.description })),
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const filteredByType = filter === 'all' ? allRows : allRows.filter(r => r._type === filter)

  const q = search.toLowerCase()
  const filtered = q
    ? filteredByType.filter(r =>
        String(r.invoice_number || '').toLowerCase().includes(q) ||
        (r.date || '').includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r._desc || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q) ||
        String(r._amount).includes(q)
      )
    : filteredByType

  const visible = expanded || q ? filtered : filtered.slice(0, PAGE_SIZE)
  const hasMore = !q && filtered.length > PAGE_SIZE

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const dieselTotal = dieselRows.reduce((s, r) => s + (Number(r.value) || 0), 0)
  const defTotal = defRows.reduce((s, r) => s + (Number(r.value) || 0), 0)
  const choferRows = expenseRows.filter(r => r.category === 'Pago Chofer')
  const otherExpenseRows = expenseRows.filter(r => r.category !== 'Pago Chofer')
  const choferTotal = choferRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const expenseTotal = otherExpenseRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const grandTotal = dieselTotal + defTotal + choferTotal + expenseTotal

  // Counts per type for filter badges
  const counts = { all: allRows.length, diesel: dieselRows.length, def: defRows.length, chofer: choferRows.length, expense: otherExpenseRows.length }

  async function handleDelete(row) {
    const typeLabel = row._type === 'diesel' ? 'diesel' : row._type === 'def' ? 'DEF' : row._type === 'chofer' ? 'pago chofer' : 'gasto'
    const ok = await toast.confirm(`Eliminar este registro de ${typeLabel}?`)
    if (!ok) return
    const table = (row._type === 'expense' || row._type === 'chofer') ? 'expenses' : row._type
    const { error } = await supabase.from(table).delete().eq('id', row.id)
    if (error) { toast.error(friendlyError(error.message)); return }
    fetchAll()
    if (onDataChange) onDataChange()
    toast.success(`Registro de ${typeLabel} eliminado`)
  }

  function handleSaved() {
    setShowModal(false)
    setEditRow(null)
    fetchAll()
    if (onDataChange) onDataChange()
  }

  async function handleTransferToOwner(row) {
    const typeLabel = row._type === 'diesel' ? 'diesel' : row._type === 'def' ? 'DEF' : row._type === 'chofer' ? 'pago chofer' : 'gasto'
    const ok = await toast.confirm(`Transferir este ${typeLabel} a gastos del propietario?`, { confirmText: 'Transferir', confirmClass: 'bg-amber-600 hover:bg-amber-500' })
    if (!ok) return
    // Insert into owner_expenses
    const ownerRecord = {
      truck_id: truckId,
      cycle_id: cycle?.id || null,
      category: row._type === 'diesel' ? 'Diesel' : row._type === 'def' ? 'DEF' : (row.category || 'Otros'),
      invoice_number: row.invoice_number || null,
      description: row._desc || row.description || `${typeLabel} transferido`,
      amount: row._amount,
      date: row.date,
      period_start: row.period_start || period.start,
      period_end: row.period_end || period.end,
    }
    const { error: insertErr } = await supabase.from('owner_expenses').insert(ownerRecord)
    if (insertErr) { toast.error(friendlyError(insertErr.message)); return }
    // Delete from original table
    const table = (row._type === 'expense' || row._type === 'chofer') ? 'expenses' : row._type
    const { error: delErr } = await supabase.from(table).delete().eq('id', row.id)
    if (delErr) { toast.error(friendlyError(delErr.message)); return }
    fetchAll()
    if (onDataChange) onDataChange()
    toast.success(`${typeLabel} transferido a gastos del propietario`)
  }

  const typeBadge = (type) => {
    const styles = {
      diesel: 'bg-orange-900/40 text-orange-400',
      def: 'bg-cyan-900/40 text-cyan-400',
      chofer: 'bg-violet-900/40 text-violet-400',
      expense: 'bg-red-900/40 text-red-400',
    }
    const labels = { diesel: 'Diesel', def: 'DEF', chofer: 'Chofer', expense: 'Gasto' }
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[type]}`}>{labels[type]}</span>
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setExpanded(false) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filter === f.key
                ? f.key === 'diesel' ? 'bg-orange-600/20 text-orange-400 border border-orange-600/40'
                  : f.key === 'def' ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/40'
                  : f.key === 'chofer' ? 'bg-violet-600/20 text-violet-400 border border-violet-600/40'
                  : f.key === 'expense' ? 'bg-red-600/20 text-red-400 border border-red-600/40'
                  : 'bg-gray-700 text-white border border-gray-600'
                : 'bg-gray-800/50 text-gray-500 border border-transparent hover:text-gray-300'
            }`}
          >
            {f.label}
            <span className={`text-[10px] px-1 py-0.5 rounded ${filter === f.key ? 'bg-white/10' : 'bg-gray-800'}`}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-xs sm:text-sm text-gray-400 flex flex-wrap gap-x-2">
          <span className="text-orange-400">Diesel: {fmt(dieselTotal)}</span>
          <span className="text-gray-600">|</span>
          <span className="text-cyan-400">DEF: {fmt(defTotal)}</span>
          <span className="text-gray-600">|</span>
          <span className="text-violet-400">Chofer: {fmt(choferTotal)}</span>
          <span className="text-gray-600">|</span>
          <span className="text-red-400">Gastos: {fmt(expenseTotal)}</span>
          <span className="text-gray-600">|</span>
          <span className="text-white font-semibold">Total: {fmt(grandTotal)}</span>
        </div>
        <div className="flex gap-2 items-center">
          {showSearch && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500 w-48 sm:w-56"
              autoFocus
            />
          )}
          <button
            onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearch('') }}
            className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'bg-blue-600/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>
          {!readOnly && (
            <button
              onClick={() => { setEditRow(null); setShowModal(true) }}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors"
            >
              + Agregar
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-3">Tipo</th>
              <th className="pb-2 pr-3">Invoice #</th>
              <th className="pb-2 pr-3">Fecha</th>
              <th className="pb-2 pr-3">Ciudad</th>
              <th className="pb-2 pr-3">Detalle</th>
              <th className="pb-2 pr-3 text-right">Monto</th>
              {!readOnly && <th className="pb-2 w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr key={`${row._type}-${row.id}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2.5 pr-3">{typeBadge(row._type)}</td>
                <td className="py-2.5 pr-3 text-white font-medium">{row.invoice_number || '-'}</td>
                <td className="py-2.5 pr-3">{row.date}</td>
                <td className="py-2.5 pr-3">{row.city || '-'}</td>
                <td className="py-2.5 pr-3 text-gray-300">
                  {row._type === 'expense' ? (
                    <span>
                      <span className="text-[10px] bg-gray-800 rounded px-1.5 py-0.5 mr-1.5 text-gray-400">{row.category}</span>
                      {row._desc}
                    </span>
                  ) : row._desc}
                </td>
                <td className="py-2.5 pr-3 text-right text-red-400 font-medium">{fmt(row._amount)}</td>
                {!readOnly && (
                  <td className="py-2.5">
                    <div className="flex gap-1 justify-end">
                      {isLis && (
                        <button onClick={() => handleTransferToOwner(row)} className="p-1 text-gray-500 hover:text-amber-400" title="Transferir a propietario">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                          </svg>
                        </button>
                      )}
                      <button onClick={() => { setEditRow(row); setShowModal(true) }} className="p-1 text-gray-500 hover:text-blue-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(row)} className="p-1 text-gray-500 hover:text-red-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={readOnly ? 6 : 7} className="py-8 text-center text-gray-600">{q ? 'Sin resultados' : 'Sin registros en este periodo'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-4 py-1 bg-gray-800 border border-gray-700 border-t-0 rounded-b-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      )}

      <AddReceiptModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditRow(null) }}
        onSaved={handleSaved}
        truckId={truckId}
        period={period}
        cycle={cycle}
        editRow={editRow}
      />
    </div>
  )
}
