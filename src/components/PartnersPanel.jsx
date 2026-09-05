import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, friendlyError } from './Toast'
import AddModal from './AddModal'

const fields = [
  { name: 'name', label: 'Nombre', required: true, placeholder: 'Ej: Jairo' },
  { name: 'percentage', label: 'Porcentaje (%)', type: 'number', step: '0.01', required: true, placeholder: 'Ej: 20' },
  { name: 'invested', label: 'Invertido ($)', type: 'number', step: '0.01', default: '0' },
]

export default function PartnersPanel({ truckId, aRepartir }) {
  const toast = useToast()
  const [partners, setPartners] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState(null)

  useEffect(() => { fetchPartners() }, [truckId])

  async function fetchPartners() {
    const { data } = await supabase.from('partners').select('*')
      .eq('truck_id', truckId).order('created_at')
    setPartners(data || [])
  }

  async function handleSave(data) {
    const record = { ...data, truck_id: truckId }
    if (editRow) {
      const { error } = await supabase.from('partners').update(record).eq('id', editRow.id)
      if (error) { toast.error(friendlyError(error.message)); return }
      toast.success('Socio actualizado')
    } else {
      const { error } = await supabase.from('partners').insert(record)
      if (error) { toast.error(friendlyError(error.message)); return }
      toast.success('Socio agregado')
    }
    setShowModal(false)
    setEditRow(null)
    fetchPartners()
  }

  async function handleDelete(id) {
    const ok = await toast.confirm('Eliminar este socio?')
    if (!ok) return
    const { error } = await supabase.from('partners').delete().eq('id', id)
    if (error) { toast.error(friendlyError(error.message)); return }
    fetchPartners()
    toast.success('Socio eliminado')
  }

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const totalPct = partners.reduce((s, p) => s + (Number(p.percentage) || 0), 0)
  const dividends = aRepartir > 0 ? aRepartir : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-white">Socios & Dividendos</h4>
        <button
          onClick={() => { setEditRow(null); setShowModal(true) }}
          className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-500 transition-colors"
        >
          + Agregar Socio
        </button>
      </div>

      {totalPct !== 100 && partners.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-3 mb-4">
          <p className="text-xs text-yellow-400">Los porcentajes suman {totalPct}% (deben sumar 100%)</p>
        </div>
      )}

      {partners.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-4">Sin socios configurados</p>
      ) : (
        <div className="space-y-2">
          {partners.map(p => {
            const share = dividends * (Number(p.percentage) / 100)
            const pending = share - (Number(p.invested) || 0)
            return (
              <div key={p.id} className="bg-gray-800/50 rounded-lg p-4 flex items-center justify-between group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white font-medium text-sm sm:text-base">{p.name}</span>
                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{p.percentage}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs">
                    <div>
                      <span className="text-gray-500">Dividendo</span>
                      <p className="text-green-400 font-semibold">{fmt(share)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Invertido</span>
                      <p className="text-blue-400 font-semibold">{fmt(p.invested)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Pendiente</span>
                      <p className={`font-semibold ${pending >= 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                        {fmt(pending)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
                  <button onClick={() => { setEditRow(p); setShowModal(true) }} className="p-1.5 text-gray-500 hover:text-orange-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-500 hover:text-red-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditRow(null) }}
        onSave={handleSave}
        fields={fields}
        initialData={editRow}
        title={editRow ? 'Editar Socio' : 'Agregar Socio'}
      />
    </div>
  )
}
