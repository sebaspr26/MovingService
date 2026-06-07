import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AddModal from './AddModal'

const fields = [
  { name: 'order_number', label: 'Orden #', required: true },
  { name: 'pu_date', label: 'Fecha Pickup', type: 'date', required: true },
  { name: 'pu_city', label: 'Ciudad Pickup', required: true },
  { name: 'do_date', label: 'Fecha Delivery', type: 'date', required: true },
  { name: 'do_city', label: 'Ciudad Delivery', required: true },
  { name: 'miles', label: 'Millas', type: 'number', step: '0.01' },
  { name: 'rate', label: 'Rate ($)', type: 'number', step: '0.01', required: true },
]

export default function OrdersTable({ truckId, period, onDataChange }) {
  const [rows, setRows] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState(null)

  useEffect(() => { fetchRows() }, [truckId, period])

  async function fetchRows() {
    const { data } = await supabase.from('orders').select('*')
      .eq('truck_id', truckId)
      .gte('pu_date', period.start)
      .lte('pu_date', period.end)
      .order('pu_date')
    setRows(data || [])
  }

  async function handleSave(data) {
    const record = { ...data, truck_id: truckId, period_start: period.start, period_end: period.end }
    if (editRow) {
      await supabase.from('orders').update(record).eq('id', editRow.id)
    } else {
      await supabase.from('orders').insert(record)
    }
    setShowModal(false)
    setEditRow(null)
    fetchRows()
    if (onDataChange) onDataChange()
  }

  async function handleDelete(id) {
    if (!confirm('Eliminar este registro?')) return
    await supabase.from('orders').delete().eq('id', id)
    fetchRows()
    if (onDataChange) onDataChange()
  }

  const total = rows.reduce((s, r) => s + (Number(r.rate) || 0), 0)
  const totalMiles = rows.reduce((s, r) => s + (Number(r.miles) || 0), 0)
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-xs sm:text-sm text-gray-400">
          {rows.length} ordenes | {totalMiles.toLocaleString()} mi | Total: <span className="text-green-400 font-semibold">{fmt(total)}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setEditRow(null); setShowModal(true) }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors"
          >
            + Agregar Orden
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-4">Orden #</th>
              <th className="pb-2 pr-4">PU Date</th>
              <th className="pb-2 pr-4">PU City</th>
              <th className="pb-2 pr-4">DO Date</th>
              <th className="pb-2 pr-4">DO City</th>
              <th className="pb-2 pr-4 text-right">Miles</th>
              <th className="pb-2 pr-4 text-right">Rate</th>
              <th className="pb-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2.5 pr-4 text-white font-medium">{row.order_number}</td>
                <td className="py-2.5 pr-4">{row.pu_date}</td>
                <td className="py-2.5 pr-4">{row.pu_city}</td>
                <td className="py-2.5 pr-4">{row.do_date}</td>
                <td className="py-2.5 pr-4">{row.do_city}</td>
                <td className="py-2.5 pr-4 text-right">{Number(row.miles || 0).toLocaleString()}</td>
                <td className="py-2.5 pr-4 text-right text-green-400">{fmt(row.rate)}</td>
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
              <tr><td colSpan={8} className="py-8 text-center text-gray-600">Sin ordenes en este periodo</td></tr>
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
        title={editRow ? 'Editar Orden' : 'Agregar Orden'}
        onScan={() => {}}
      />
    </div>
  )
}
