import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, friendlyError } from './Toast'
import AddModal from './AddModal'

const CATEGORIES = [
  'Mantenimiento', 'Seguro', 'Peajes', 'Reparacion', 'Llantas',
  'Lavado', 'Parqueo', 'Multas', 'Comida', 'Diesel', 'DEF', 'Otros'
]

const fields = [
  { name: 'category', label: 'Categoria', type: 'select', required: true,
    options: CATEGORIES.map(c => ({ value: c, label: c })) },
  { name: 'invoice_number', label: 'Invoice #' },
  { name: 'description', label: 'Descripcion', required: true },
  { name: 'amount', label: 'Monto ($)', type: 'number', step: '0.01', required: true },
  { name: 'date', label: 'Fecha', type: 'date', required: true },
]

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'diesel', label: 'Diesel' },
  { key: 'def', label: 'DEF' },
  { key: 'expense', label: 'Otros Gastos' },
]


export default function OwnerExpensesTable({ truckId, period, cycle, onDataChange, readOnly, ownerName }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  useEffect(() => { fetchRows() }, [truckId, cycle?.id, period])

  async function fetchRows() {
    if (!cycle?.id) return
    const { data } = await supabase.from('owner_expenses').select('*')
      .eq('truck_id', truckId)
      .eq('cycle_id', cycle.id)
      .order('date')
    let filtered = data || []
    if (period.start !== cycle.start_date) {
      filtered = filtered.filter(r => r.date >= period.start && r.date <= period.end)
    }
    setRows(filtered)
  }

  async function handleSave(data) {
    try {
      const record = {
        category: data.category,
        invoice_number: data.invoice_number || null,
        description: data.description,
        amount: data.amount !== '' && data.amount !== null ? Number(data.amount) : null,
        date: data.date,
        truck_id: truckId,
        cycle_id: cycle?.id || null,
        period_start: period.start,
        period_end: period.end,
      }
      let result
      if (editRow) {
        result = await supabase.from('owner_expenses').update(record).eq('id', editRow.id)
      } else {
        result = await supabase.from('owner_expenses').insert(record)
      }
      if (result.error) throw result.error
      setShowModal(false)
      setEditRow(null)
      fetchRows()
      if (onDataChange) onDataChange()
      toast.success(editRow ? 'Gasto actualizado' : 'Gasto agregado')
    } catch (err) {
      toast.error(friendlyError(err.message || err))
    }
  }

  async function handleDelete(id) {
    const ok = await toast.confirm('Eliminar este gasto del propietario?')
    if (!ok) return
    const { error } = await supabase.from('owner_expenses').delete().eq('id', id)
    if (error) { toast.error(friendlyError(error.message)); return }
    fetchRows()
    if (onDataChange) onDataChange()
    toast.success('Gasto eliminado')
  }

  // Classify rows by type
  const classifyType = (cat) => {
    if (cat === 'Diesel') return 'diesel'
    if (cat === 'DEF') return 'def'
    return 'expense'
  }

  const allRows = rows.map(r => ({ ...r, _type: classifyType(r.category), _amount: Number(r.amount) || 0 }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const filteredByType = filter === 'all' ? allRows : allRows.filter(r => r._type === filter)

  // Counts per type
  const counts = {
    all: allRows.length,
    diesel: allRows.filter(r => r._type === 'diesel').length,
    def: allRows.filter(r => r._type === 'def').length,
    expense: allRows.filter(r => r._type === 'expense').length,
  }

  // Totals per type
  const dieselTotal = allRows.filter(r => r._type === 'diesel').reduce((s, r) => s + r._amount, 0)
  const defTotal = allRows.filter(r => r._type === 'def').reduce((s, r) => s + r._amount, 0)
  const expenseTotal = allRows.filter(r => r._type === 'expense').reduce((s, r) => s + r._amount, 0)
  const grandTotal = dieselTotal + defTotal + expenseTotal

  const q = search.toLowerCase()
  const filtered = q
    ? filteredByType.filter(r =>
        (r.category || '').toLowerCase().includes(q) ||
        String(r.invoice_number || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.date || '').includes(q) ||
        String(r._amount).includes(q)
      )
    : filteredByType

  const visible = filtered

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const typeBadge = (type) => {
    const styles = {
      diesel: 'bg-orange-900/40 text-orange-400',
      def: 'bg-cyan-900/40 text-cyan-400',
      expense: 'bg-amber-900/40 text-amber-400',
    }
    const labels = { diesel: 'Diesel', def: 'DEF', expense: 'Gasto' }
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[type]}`}>{labels[type]}</span>
  }

  return (
    <div>
      {ownerName && (
        <div className="mb-4 flex items-center gap-2">
          <span className="px-2 py-0.5 bg-amber-900/30 text-amber-400 rounded text-xs font-medium">LIS</span>
          <span className="text-sm text-gray-300">Propietario: <span className="text-white font-medium">{ownerName}</span></span>
          <span className="text-gray-600 text-[10px]">(no afecta balance)</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filter === f.key
                ? f.key === 'diesel' ? 'bg-orange-600/20 text-orange-400 border border-orange-600/40'
                  : f.key === 'def' ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/40'
                  : f.key === 'expense' ? 'bg-amber-600/20 text-amber-400 border border-amber-600/40'
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
          <span className="text-amber-400">Gastos: {fmt(expenseTotal)}</span>
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
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-500 transition-colors"
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
              <th className="pb-2 pr-3">Descripcion</th>
              <th className="pb-2 pr-3 text-right">Monto</th>
              {!readOnly && <th className="pb-2 w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2.5 pr-3">{typeBadge(row._type)}</td>
                <td className="py-2.5 pr-3 text-white font-medium">{row.invoice_number || '-'}</td>
                <td className="py-2.5 pr-3">{row.date}</td>
                <td className="py-2.5 pr-3 text-gray-300">
                  {row._type === 'expense' ? (
                    <span>
                      <span className="text-[10px] bg-gray-800 rounded px-1.5 py-0.5 mr-1.5 text-gray-400">{row.category}</span>
                      {row.description}
                    </span>
                  ) : row.description}
                </td>
                <td className="py-2.5 pr-3 text-right text-amber-400 font-medium">{fmt(row._amount)}</td>
                {!readOnly && (
                  <td className="py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => { setEditRow(row); setShowModal(true) }} className="p-1 text-gray-500 hover:text-blue-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(row.id)} className="p-1 text-gray-500 hover:text-red-400">
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
              <tr><td colSpan={readOnly ? 5 : 6} className="py-8 text-center text-gray-600">{q ? 'Sin resultados' : 'Sin gastos del propietario en este periodo'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <AddModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditRow(null) }}
        onSave={handleSave}
        fields={fields}
        initialData={editRow}
        title={editRow ? 'Editar Gasto Propietario' : 'Agregar Gasto Propietario'}
        onScan={() => {}}
      />
    </div>
  )
}
