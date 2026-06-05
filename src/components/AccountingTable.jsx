import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AddModal from './AddModal'

const fields = [
  { name: 'description', label: 'Descripcion', required: true },
  { name: 'reference', label: 'Referencia' },
  { name: 'debit', label: 'Debito ($)', type: 'number', step: '0.01' },
  { name: 'credit', label: 'Credito ($)', type: 'number', step: '0.01' },
]

export default function AccountingTable({ truckId, period }) {
  const [rows, setRows] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState(null)

  useEffect(() => { fetchRows() }, [truckId, period])

  async function fetchRows() {
    const { data } = await supabase.from('accounting').select('*')
      .eq('truck_id', truckId)
      .gte('period_start', period.start)
      .lte('period_end', period.end)
      .order('created_at')
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
  }

  async function handleDelete(id) {
    if (!confirm('Eliminar este registro?')) return
    await supabase.from('accounting').delete().eq('id', id)
    fetchRows()
  }

  const totalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0)
  const balance = totalDebit - totalCredit
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-xs sm:text-sm text-gray-400 flex flex-wrap gap-2 sm:gap-4">
          <span>Debito: <span className="text-green-400 font-semibold">{fmt(totalDebit)}</span></span>
          <span>Credito: <span className="text-red-400 font-semibold">{fmt(totalCredit)}</span></span>
          <span>Balance: <span className={`font-semibold ${balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(balance)}</span></span>
        </div>
        <button
          onClick={() => { setEditRow(null); setShowModal(true) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors"
        >
          + Agregar Registro
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-4">Descripcion</th>
              <th className="pb-2 pr-4">Referencia</th>
              <th className="pb-2 pr-4 text-right">Debito</th>
              <th className="pb-2 pr-4 text-right">Credito</th>
              <th className="pb-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2.5 pr-4 text-white">{row.description}</td>
                <td className="py-2.5 pr-4 text-gray-400">{row.reference || '-'}</td>
                <td className="py-2.5 pr-4 text-right text-green-400">
                  {row.debit ? fmt(row.debit) : '-'}
                </td>
                <td className="py-2.5 pr-4 text-right text-red-400">
                  {row.credit ? fmt(row.credit) : '-'}
                </td>
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
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-gray-600">Sin registros contables en este periodo</td></tr>
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
        title={editRow ? 'Editar Registro' : 'Agregar Registro'}
      />
    </div>
  )
}
