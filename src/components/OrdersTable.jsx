import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { analyzeReceipt, isScannerBusy } from '../lib/gemini'
import { useToast, friendlyError } from './Toast'
import { STATUS_CONFIG, autoAdvanceStatuses } from '../lib/orders'

const PAGE_SIZE = 5

export default function OrdersTable({ truckId, period, cycle, onDataChange, readOnly, discountPct }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Form state
  const [fOrderNumber, setFOrderNumber] = useState('')
  const [fPuDate, setFPuDate] = useState('')
  const [fPuCity, setFPuCity] = useState('')
  const [fDoDate, setFDoDate] = useState('')
  const [fDoCity, setFDoCity] = useState('')
  const [fMiles, setFMiles] = useState('')
  const [fRate, setFRate] = useState('')
  const [fApplyDiscount, setFApplyDiscount] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const scanFileRef = useRef()

  useEffect(() => { fetchRows() }, [truckId, cycle?.id, period])
  useEffect(() => { setExpanded(false) }, [period])

  async function fetchRows() {
    if (!cycle?.id) return
    const { data } = await supabase.from('orders').select('*')
      .eq('truck_id', truckId)
      .eq('cycle_id', cycle.id)
      .order('pu_date')
    // Sub-filter by week if a week is selected (period narrower than full cycle)
    let filtered = data || []
    if (period.start !== cycle.start_date) {
      filtered = filtered.filter(r => r.pu_date >= period.start && r.pu_date <= period.end)
    }
    const advanced = await autoAdvanceStatuses(filtered, supabase)
    setRows(advanced)
  }

  function openModal(row = null) {
    setEditRow(row)
    setFOrderNumber(row?.order_number || '')
    setFPuDate(row?.pu_date || '')
    setFPuCity(row?.pu_city || '')
    setFDoDate(row?.do_date || '')
    setFDoCity(row?.do_city || '')
    setFMiles(row?.miles ?? '')
    setFRate(row?.rate ?? '')
    setFApplyDiscount(row ? (row.apply_discount !== false) : true)
    setScanned(false)
    setShowModal(true)
  }

  async function handleScanFile(file) {
    if (!file || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) return
    if (isScannerBusy()) return
    setScanning(true)
    try {
      const res = await analyzeReceipt(file)
      if (res.data) {
        if (res.data.order_number) setFOrderNumber(res.data.order_number)
        if (res.data.pu_date) setFPuDate(res.data.pu_date)
        if (res.data.pu_city) setFPuCity(res.data.pu_city)
        if (res.data.do_date) setFDoDate(res.data.do_date)
        if (res.data.do_city) setFDoCity(res.data.do_city)
        if (res.data.miles) setFMiles(String(res.data.miles))
        if (res.data.rate) setFRate(String(res.data.rate))
      }
      setScanned(true)
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setScanning(false)
      if (scanFileRef.current) scanFileRef.current.value = ''
    }
  }

  function closeModal() {
    setShowModal(false)
    setEditRow(null)
  }

  async function handleTogglePaid(row) {
    if (readOnly) return
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, paid: !r.paid } : r))
    const { error } = await supabase.from('orders').update({ paid: !row.paid }).eq('id', row.id)
    if (error) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, paid: row.paid } : r))
      toast.error(friendlyError(error.message))
      return
    }
    if (onDataChange) onDataChange()
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!fOrderNumber.trim()) { toast.warning('Completa el campo "Orden #"'); return }
    if (!fPuDate) { toast.warning('Completa el campo "Fecha Pickup"'); return }
    if (!fPuCity.trim()) { toast.warning('Completa el campo "Ciudad Pickup"'); return }
    if (!fDoDate) { toast.warning('Completa el campo "Fecha Delivery"'); return }
    if (!fDoCity.trim()) { toast.warning('Completa el campo "Ciudad Delivery"'); return }
    if (!fRate && fRate !== 0) { toast.warning('Completa el campo "Rate"'); return }
    try {
      const record = {
        order_number: fOrderNumber.trim(),
        pu_date: fPuDate,
        pu_city: fPuCity.trim(),
        do_date: fDoDate,
        do_city: fDoCity.trim(),
        miles: fMiles !== '' ? Number(fMiles) : null,
        rate: fRate !== '' ? Number(fRate) : null,
        apply_discount: fApplyDiscount,
        truck_id: truckId,
        cycle_id: cycle?.id || null,
        period_start: period.start,
        period_end: period.end,
      }
      let result
      if (editRow) {
        result = await supabase.from('orders').update(record).eq('id', editRow.id)
      } else {
        // Duplicate check by order_number
        const { data: existing } = await supabase.from('orders').select('id')
          .eq('truck_id', truckId).eq('order_number', record.order_number).limit(1)
        if (existing && existing.length > 0) {
          const ok = await toast.confirm(`Ya existe una orden con el numero "${record.order_number}". ¿Agregar de todas formas?`)
          if (!ok) return
        }
        record.discount_percent = discountPct || 13
        result = await supabase.from('orders').insert(record)
      }
      if (result.error) throw result.error
      closeModal()
      fetchRows()
      if (onDataChange) onDataChange()
      toast.success(editRow ? 'Orden actualizada' : 'Orden agregada')
    } catch (err) {
      toast.error(friendlyError(err.message || err))
    }
  }

  async function handleDelete(id) {
    const ok = await toast.confirm('Eliminar esta orden?')
    if (!ok) return
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) { toast.error(friendlyError(error.message)); return }
    fetchRows()
    if (onDataChange) onDataChange()
    toast.success('Orden eliminada')
  }

  const q = search.toLowerCase()
  const filtered = q
    ? rows.filter(r =>
        String(r.order_number).toLowerCase().includes(q) ||
        (r.pu_date || '').includes(q) ||
        (r.pu_city || '').toLowerCase().includes(q) ||
        (r.do_date || '').includes(q) ||
        (r.do_city || '').toLowerCase().includes(q) ||
        String(r.rate).includes(q)
      )
    : rows

  const visible = expanded || q ? filtered : filtered.slice(0, PAGE_SIZE)
  const hasMore = !q && filtered.length > PAGE_SIZE

  const paidRows = rows.filter(r => r.paid)
  const total = paidRows.reduce((s, r) => {
    const rate = Number(r.rate) || 0
    const rowPct = Number(r.discount_percent) || discountPct || 13
    return s + (r.apply_discount !== false ? rate * (1 - rowPct / 100) : rate)
  }, 0)
  const totalMiles = paidRows.reduce((s, r) => s + (Number(r.miles) || 0), 0)
  const pendingCount = rows.filter(r => !r.paid).length
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const pct = editRow ? (Number(editRow.discount_percent) || discountPct || 13) : (discountPct || 13)
  const rateNum = Number(fRate) || 0
  const netoPreview = fApplyDiscount ? rateNum * (1 - pct / 100) : rateNum

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="text-xs sm:text-sm text-gray-400 flex flex-wrap gap-2 sm:gap-4">
          <span>{rows.length} ordenes</span>
          {pendingCount > 0 && (
            <span className="text-yellow-500">
              {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
          <span>{totalMiles.toLocaleString()} mi</span>
          <span>Total: <span className="text-green-400 font-semibold">{fmt(total)}</span></span>
        </div>
        <div className="flex gap-2 items-center">
          {showSearch && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar orden, ciudad, fecha..."
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
              onClick={() => openModal()}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors"
            >
              + Agregar Orden
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-2 w-8"><span className="sr-only">Pagado</span></th>
              <th className="pb-2 pr-4">Orden #</th>
              <th className="pb-2 pr-4">PU Date</th>
              <th className="pb-2 pr-4">PU City</th>
              <th className="pb-2 pr-4">DO Date</th>
              <th className="pb-2 pr-4">DO City</th>
              <th className="pb-2 pr-4 text-right">Miles</th>
              <th className="pb-2 pr-4 text-right">Rate</th>
              <th className="pb-2 pr-4 text-center">Desc.</th>
              {!readOnly && <th className="pb-2 w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(row => {
              const hasDiscount = row.apply_discount !== false
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-800/50 transition-colors ${
                    row.paid ? 'hover:bg-gray-800/30' : 'opacity-50 hover:opacity-70 hover:bg-gray-800/20'
                  }`}
                >
                  <td className="py-2.5 pr-2">
                    <button
                      onClick={() => handleTogglePaid(row)}
                      disabled={readOnly}
                      title={row.paid ? 'Marcar como pendiente' : 'Marcar como pagado'}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        row.paid
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-gray-600 hover:border-yellow-500 bg-transparent'
                      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {row.paid && (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  </td>
                  <td className={`py-2.5 pr-4 font-medium ${row.paid ? 'text-white' : 'text-gray-500'}`}>
                    <Link to={`/orders/${row.id}`} className="hover:text-blue-400 transition-colors">
                      {row.order_number}
                    </Link>
                    {row.status === 'tonu' ? (
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 font-semibold">
                        TONU +{fmt(Number(row.rate) || 150)}
                      </span>
                    ) : row.status && row.status !== 'delivered' ? (
                      <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded ${STATUS_CONFIG[row.status]?.bg || ''} ${STATUS_CONFIG[row.status]?.text || 'text-gray-500'}`}>
                        {STATUS_CONFIG[row.status]?.label || row.status}
                      </span>
                    ) : null}
                    {!row.paid && !row.status && (
                      <span className="ml-2 text-[9px] bg-yellow-900/40 text-yellow-500 px-1.5 py-0.5 rounded">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">{row.pu_date}</td>
                  <td className="py-2.5 pr-4">{row.pu_city}</td>
                  <td className="py-2.5 pr-4">{row.do_date}</td>
                  <td className="py-2.5 pr-4">{row.do_city}</td>
                  <td className="py-2.5 pr-4 text-right">{Number(row.miles || 0).toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-right">
                    <div className={row.paid ? 'text-green-400' : 'text-gray-500'}>{fmt(row.rate)}</div>
                    {hasDiscount && row.paid && (
                      <div className="text-[9px] text-gray-500">neto {fmt(Number(row.rate) * (1 - (Number(row.discount_percent) || discountPct || 13) / 100))}</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-center">
                    {hasDiscount ? (
                      <span className="text-[9px] bg-orange-900/40 text-orange-400 px-1.5 py-0.5 rounded">-{Number(row.discount_percent) || discountPct || 13}%</span>
                    ) : (
                      <span className="text-[9px] bg-gray-800 text-gray-600 px-1.5 py-0.5 rounded">sin desc.</span>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="py-2.5">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openModal(row)} className="p-1 text-gray-500 hover:text-blue-400">
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
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 9 : 10} className="py-8 text-center text-gray-600">
                  {q ? 'Sin resultados' : 'Sin ordenes en este periodo'}
                </td>
              </tr>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">{editRow ? 'Editar Orden' : 'Agregar Orden'}</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              {/* Scan button */}
              <div>
                <button
                  type="button"
                  onClick={() => scanFileRef.current?.click()}
                  disabled={scanning}
                  className="w-full px-4 py-3 bg-purple-600/20 border border-purple-600/50 text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {scanning ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Analizando imagen...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                      </svg>
                      Escanear recibo / PDF
                    </>
                  )}
                </button>
                <input
                  ref={scanFileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleScanFile(e.target.files[0])}
                />
              </div>

              {scanned && (
                <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-xs text-emerald-400">Datos escaneados. Revisa que todo este correcto antes de guardar.</p>
                </div>
              )}

              {[
                { label: 'Orden #', value: fOrderNumber, set: setFOrderNumber, required: true },
                { label: 'Fecha Pickup', value: fPuDate, set: setFPuDate, type: 'date', required: true },
                { label: 'Ciudad Pickup', value: fPuCity, set: setFPuCity, required: true },
                { label: 'Fecha Delivery', value: fDoDate, set: setFDoDate, type: 'date', required: true },
                { label: 'Ciudad Delivery', value: fDoCity, set: setFDoCity, required: true },
                { label: 'Millas', value: fMiles, set: setFMiles, type: 'number', step: '0.01' },
                { label: 'Rate ($)', value: fRate, set: setFRate, type: 'number', step: '0.01', required: true },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{f.label}</label>
                  <input
                    type={f.type || 'text'}
                    step={f.step}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    required={f.required}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}

              {/* Toggle descuento */}
              <div className={`rounded-lg p-3 border transition-colors ${
                fApplyDiscount ? 'bg-orange-900/20 border-orange-800/40' : 'bg-gray-800/40 border-gray-700'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-300">Aplicar descuento ({pct}%)</p>
                    {rateNum > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fmt(rateNum)} → neto {fmt(netoPreview)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFApplyDiscount(v => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      fApplyDiscount ? 'bg-orange-500' : 'bg-gray-600'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      fApplyDiscount ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={scanning}
                  className={`flex-1 px-4 py-2 text-white rounded-lg text-sm transition-colors disabled:opacity-50 ${
                    scanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'
                  }`}>
                  {scanned ? 'Confirmar Datos' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}