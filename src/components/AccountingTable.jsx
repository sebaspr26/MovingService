import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AddModal from './AddModal'

const fields = [
  { name: 'description', label: 'Descripcion', required: true },
  { name: 'reference', label: 'Referencia' },
  { name: 'date', label: 'Fecha', type: 'date', required: true },
  { name: 'debit', label: 'Debito ($)', type: 'number', step: '0.01' },
  { name: 'credit', label: 'Credito ($)', type: 'number', step: '0.01' },
]

const PAGE_SIZE = 5

export default function AccountingTable({ truckId, period, onDataChange, netIncome, totalDiesel, totalExpenses, discountPct, readOnly }) {
  const [rows, setRows] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { fetchRows() }, [truckId, period])
  useEffect(() => { setExpanded(false) }, [period])

  async function fetchRows() {
    const { data } = await supabase.from('accounting').select('*')
      .eq('truck_id', truckId)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date')
    setRows(data || [])
  }

  async function handleSave(data) {
    const record = { ...data, truck_id: truckId, period_start: period.start, period_end: period.end }
    if (editRow) {
      await supabase.from('accounting').update(record).eq('id', editRow.id)
    } else {
      await supabase.from('accounting').insert(record)
    }
    setShowModal(false)
    setEditRow(null)
    fetchRows()
    if (onDataChange) onDataChange()
  }

  async function handleDelete(id) {
    if (!confirm('Eliminar este registro?')) return
    await supabase.from('accounting').delete().eq('id', id)
    fetchRows()
    if (onDataChange) onDataChange()
  }

  const autoRows = [
    { description: `Ingreso Neto (Orders -${discountPct || 13}%)`, reference: 'Auto', debit: 0, credit: netIncome || 0 },
    { description: 'Total Diesel', reference: 'Auto', debit: totalDiesel || 0, credit: 0 },
    { description: 'Total Gastos', reference: 'Auto', debit: totalExpenses || 0, credit: 0 },
  ]

  const q = search.toLowerCase()
  const filtered = q
    ? rows.filter(r =>
        (r.description || '').toLowerCase().includes(q) ||
        (r.reference || '').toLowerCase().includes(q) ||
        (r.date || '').includes(q) ||
        String(r.debit).includes(q) ||
        String(r.credit).includes(q)
      )
    : rows

  const visible = expanded || q ? filtered : filtered.slice(0, PAGE_SIZE)
  const hasMore = !q && filtered.length > PAGE_SIZE

  const manualDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0)
  const manualCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0)
  const autoDebit = (totalDiesel || 0) + (totalExpenses || 0)
  const autoCredit = (netIncome || 0)
  const totalDebit = autoDebit + manualDebit
  const totalCredit = autoCredit + manualCredit
  const balance = totalCredit - totalDebit
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-xs sm:text-sm text-gray-400 flex flex-wrap gap-2 sm:gap-4">
          <span>Debito: <span className="text-green-400 font-semibold">{fmt(totalDebit)}</span></span>
          <span>Credito: <span className="text-red-400 font-semibold">{fmt(totalCredit)}</span></span>
          <span>Balance: <span className={`font-semibold ${balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(balance)}</span></span>
        </div>
        <div className="flex gap-2 items-center">
          {showSearch && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar descripcion, referencia..."
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
              + Agregar Registro
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-4">Descripcion</th>
              <th className="pb-2 pr-4">Referencia</th>
              <th className="pb-2 pr-4">Fecha</th>
              <th className="pb-2 pr-4 text-right">Debito</th>
              <th className="pb-2 pr-4 text-right">Credito</th>
              {!readOnly && <th className="pb-2 w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {/* Auto-generated rows */}
            {autoRows.map((row, i) => (
              <tr key={`auto-${i}`} className="border-b border-gray-800/50 bg-gray-800/20">
                <td className="py-2.5 pr-4 text-gray-300 italic">{row.description}</td>
                <td className="py-2.5 pr-4">
                  <span className="text-[10px] bg-blue-900/40 text-blue-400 px-1.5 py-0.5 rounded">Auto</span>
                </td>
                <td className="py-2.5 pr-4 text-gray-500">-</td>
                <td className="py-2.5 pr-4 text-right text-green-400/70">
                  {row.debit ? fmt(row.debit) : '-'}
                </td>
                <td className="py-2.5 pr-4 text-right text-red-400/70">
                  {row.credit ? fmt(row.credit) : '-'}
                </td>
                {!readOnly && <td className="py-2.5"></td>}
              </tr>
            ))}

            {/* Separator */}
            {visible.length > 0 && (
              <tr>
                <td colSpan={readOnly ? 5 : 6} className="py-1">
                  <div className="border-t border-dashed border-gray-700"></div>
                </td>
              </tr>
            )}

            {/* Manual rows */}
            {visible.map(row => (
              <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2.5 pr-4 text-white">{row.description}</td>
                <td className="py-2.5 pr-4 text-gray-400">{row.reference || '-'}</td>
                <td className="py-2.5 pr-4 text-gray-400">{row.date || '-'}</td>
                <td className="py-2.5 pr-4 text-right text-green-400">
                  {row.debit ? fmt(row.debit) : '-'}
                </td>
                <td className="py-2.5 pr-4 text-right text-red-400">
                  {row.credit ? fmt(row.credit) : '-'}
                </td>
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

            {/* Totals */}
            <tr className="border-t-2 border-gray-700">
              <td className="py-3 pr-4 text-white font-semibold" colSpan={3}>TOTAL</td>
              <td className="py-3 pr-4 text-right text-green-400 font-bold">{fmt(totalDebit)}</td>
              <td className="py-3 pr-4 text-right text-red-400 font-bold">{fmt(totalCredit)}</td>
              {!readOnly && <td></td>}
            </tr>
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

      <AddModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditRow(null) }}
        onSave={handleSave}
        fields={fields}
        initialData={editRow}
        title={editRow ? 'Editar Registro' : 'Agregar Registro'}
      />
    </div>
  )
}
