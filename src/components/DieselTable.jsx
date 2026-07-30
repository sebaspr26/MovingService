import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, friendlyError } from './Toast'
import AddModal from './AddModal'

const fields = [
  { name: 'invoice_number', label: 'Invoice #', required: true },
  { name: 'date', label: 'Fecha', type: 'date', required: true },
  { name: 'city', label: 'Ciudad', required: true },
  { name: 'gallons', label: 'Galones', type: 'number', step: '0.01', required: true },
  { name: 'value', label: 'Valor ($)', type: 'number', step: '0.01', required: true },
]

export default function DieselTable({ truckId, period, cycle, onDataChange, readOnly }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => { fetchRows() }, [truckId, cycle?.id, period])

  async function fetchRows() {
    if (!cycle?.id) return
    const { data } = await supabase.from('diesel').select('*')
      .eq('truck_id', truckId)
      .eq('cycle_id', cycle.id)
      .order('created_at')
    let filtered = data || []
    if (period.start !== cycle.start_date) {
      filtered = filtered.filter(r => r.date >= period.start && r.date <= period.end)
    }
    setRows(filtered)
  }

  async function handleSave(data) {
    try {
      const record = {
        invoice_number: data.invoice_number,
        date: data.date,
        city: data.city,
        gallons: data.gallons !== '' && data.gallons !== null ? Number(data.gallons) : null,
        value: data.value !== '' && data.value !== null ? Number(data.value) : null,
        truck_id: truckId,
        cycle_id: cycle?.id || null,
        period_start: period.start,
        period_end: period.end,
      }
      let result
      if (editRow) {
        result = await supabase.from('diesel').update(record).eq('id', editRow.id)
      } else {
        if (record.invoice_number) {
          const { data: existing } = await supabase.from('diesel').select('id')
            .eq('truck_id', truckId).eq('invoice_number', record.invoice_number).limit(1)
          if (existing && existing.length > 0) {
            const ok = await toast.confirm(`Ya existe un registro de diesel con invoice "${record.invoice_number}". ¿Agregar de todas formas?`)
            if (!ok) return
          }
        }
        result = await supabase.from('diesel').insert(record)
      }
      if (result.error) throw result.error
      setShowModal(false)
      setEditRow(null)
      fetchRows()
      if (onDataChange) onDataChange()
      toast.success(editRow ? 'Diesel actualizado' : 'Diesel agregado')
    } catch (err) {
      toast.error(friendlyError(err.message || err))
    }
  }

  async function handleDelete(id) {
    const ok = await toast.confirm('Eliminar este registro de diesel?')
    if (!ok) return
    const { error } = await supabase.from('diesel').delete().eq('id', id)
    if (error) { toast.error(friendlyError(error.message)); return }
    fetchRows()
    if (onDataChange) onDataChange()
    toast.success('Registro de diesel eliminado')
  }

  const q = search.toLowerCase()
  const filtered = q
    ? rows.filter(r =>
        String(r.invoice_number).toLowerCase().includes(q) ||
        (r.date || '').includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        String(r.value).includes(q) ||
        String(r.gallons).includes(q)
      )
    : rows

  const visible = filtered

  const totalGallons = rows.reduce((s, r) => s + (Number(r.gallons) || 0), 0)
  const totalValue = rows.reduce((s, r) => s + (Number(r.value) || 0), 0)
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-xs sm:text-sm text-gray-400">
          {rows.length} registros | {totalGallons.toFixed(1)} gal | Total: <span className="text-red-400 font-semibold">{fmt(totalValue)}</span>
        </div>
        <div className="flex gap-2 items-center">
          {showSearch && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar invoice, ciudad, fecha..."
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
              + Agregar Diesel
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-4">Invoice #</th>
              <th className="pb-2 pr-4">Fecha</th>
              <th className="pb-2 pr-4">Ciudad</th>
              <th className="pb-2 pr-4 text-right">Galones</th>
              <th className="pb-2 pr-4 text-right">Valor</th>
              {!readOnly && <th className="pb-2 w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2.5 pr-4 text-white font-medium">{row.invoice_number}</td>
                <td className="py-2.5 pr-4">{row.date}</td>
                <td className="py-2.5 pr-4">{row.city}</td>
                <td className="py-2.5 pr-4 text-right">{Number(row.gallons).toFixed(1)}</td>
                <td className="py-2.5 pr-4 text-right text-red-400">{fmt(row.value)}</td>
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
              <tr><td colSpan={readOnly ? 5 : 6} className="py-8 text-center text-gray-600">{q ? 'Sin resultados' : 'Sin registros de diesel en este periodo'}</td></tr>
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
        title={editRow ? 'Editar Diesel' : 'Agregar Diesel'}
        onScan={() => {}}
      />
    </div>
  )
}
