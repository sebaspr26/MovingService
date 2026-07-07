import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { STATUS_CONFIG, STATUS_ORDER, ALL_STATUSES, EQUIPMENT_TYPES, LOAD_TYPES, getNextStatus, isTerminalStatus, fmt, autoAdvanceStatuses } from '../lib/orders'
import { analyzeReceipt, isScannerBusy } from '../lib/gemini'
import { calculateTruckRoute, calculateMultiStopRoute, formatDuration } from '../lib/here'
import { lookupByMc, lookupByDot, searchByName } from '../lib/fmcsa'
import { useToast, friendlyError } from './Toast'
import { getActiveCycle, getActiveCycleId } from '../lib/cycles'
import OrderDocuments from './OrderDocuments'
import OrderInvoice from './OrderInvoice'

const emptyStop = () => ({ id: null, type: 'pickup', location_name: '', address: '', city: '', state: '', date: '', time: '', time_end: '', schedule_type: 'range', ref_number: '', notes: '' })
const emptyInvoiceItem = () => ({ id: null, pay_item: 'Flat Rate', units_type: 'Gross', units: 1, rate: '', total: '' })
const emptyCommodity = () => ({ id: null, name: '', qty: 1, type: 'Pail', dimensions: '', weight: '' })
const INVOICE_ITEM_TYPES = ['Flat Rate', 'Linehaul', 'Fuel Surcharge', 'Detention', 'Layover', 'TONU', 'Lumper', 'Stop Off', 'Driver Assist', 'Accessorial', 'Other']
const UNITS_TYPES = ['Flat', 'Gross', 'Per Mile', 'Per Hour', 'Percentage']
const COMMODITY_TYPES = ['Pail', 'Pallet', 'Box', 'Crate', 'Drum', 'Roll', 'Bag', 'Bundle', 'Piece', 'Other']

export default function OrderDetail({ orderId: propId, onClose, onSaved }) {
  const params = useParams()
  const id = propId || params.id
  const isDrawer = !!propId
  const isNew = id === 'new'
  const navigate = useNavigate()
  const toast = useToast()

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [rcFullscreen, setRcFullscreen] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [showTonuModal, setShowTonuModal] = useState(false)
  const [tonuPrice, setTonuPrice] = useState('150')
  const [trucks, setTrucks] = useState([])
  const [allBrokers, setAllBrokers] = useState([])

  // Order fields
  const [status, setStatus] = useState('booked')
  const [orderNumber, setOrderNumber] = useState('')
  const [truckId, setTruckId] = useState('')
  const [brokerId, setBrokerId] = useState('')
  const [brokerType, setBrokerType] = useState('broker')
  const [equipmentType, setEquipmentType] = useState('')
  const [loadType, setLoadType] = useState('')
  const [dispatcher, setDispatcher] = useState('')
  const [refNumber, setRefNumber] = useState('')
  const [rate, setRate] = useState('')
  const [applyDiscount, setApplyDiscount] = useState(true)
  const [discountPercent, setDiscountPercent] = useState(13)
  const [miles, setMiles] = useState('')
  const [deadMiles, setDeadMiles] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [driverName, setDriverName] = useState('')
  const [puDate, setPuDate] = useState('')
  const [puCity, setPuCity] = useState('')
  const [doDate, setDoDate] = useState('')
  const [doCity, setDoCity] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [cycleId, setCycleId] = useState(null)

  const [commodity, setCommodity] = useState('')
  const [weight, setWeight] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')

  // Stops
  const [stops, setStops] = useState([
    { ...emptyStop(), type: 'pickup', sequence: 0 },
    { ...emptyStop(), type: 'delivery', sequence: 1 },
  ])

  // Invoice line items
  const [invoiceItems, setInvoiceItems] = useState([])
  // Commodities
  const [commodities, setCommodities] = useState([])

  // Broker form (inline creation)
  const [showNewBroker, setShowNewBroker] = useState(false)
  const [newBroker, setNewBroker] = useState({ name: '', mc_number: '', dot_number: '', ref_number: '', address: '', phone: '', email: '' })
  const [fmcsaSuggestions, setFmcsaSuggestions] = useState([])
  const [fmcsaSearching, setFmcsaSearching] = useState(false)
  const fmcsaTimer = useRef(null)

  // Section collapse
  const [sections, setSections] = useState({ client: true, order: true, stops: true, invoicing: false, commodities: false })
  const toggle = (key) => setSections(p => ({ ...p, [key]: !p[key] }))

  // Scanner
  const [scanning, setScanning] = useState(false)
  const scanRef = useRef()

  // RC file for new orders (held in memory until save)
  const [rcFile, setRcFile] = useState(null)
  const [rcPreviewUrl, setRcPreviewUrl] = useState(null)
  const rcFileRef = useRef()
  const [rcDragging, setRcDragging] = useState(false)
  const rcDragCounter = useRef(0)

  // Order documents tracking
  const [orderDocs, setOrderDocs] = useState([])
  const [showPodUpload, setShowPodUpload] = useState(false)
  const podFileRef = useRef()

  // Route calculation
  const [calculatingRoute, setCalculatingRoute] = useState(false)
  const [routeInfo, setRouteInfo] = useState(null) // { totalMiles, totalMinutes, legs }
  const [dhInfo, setDhInfo] = useState(null) // { distanceMiles, durationMinutes }

  useEffect(() => {
    Promise.all([
      supabase.from('trucks').select('id, name, number, discount_percent').order('number'),
      supabase.from('brokers').select('*').order('name'),
    ]).then(([tRes, bRes]) => {
      setTrucks(tRes.data || [])
      setAllBrokers(bRes.data || [])
    })

    // Auto-generate ref_number for new orders
    if (isNew) {
      supabase.from('orders').select('ref_number').not('ref_number', 'is', null).order('created_at', { ascending: false }).limit(500)
        .then(({ data }) => {
          let maxNum = 0
          ;(data || []).forEach(o => {
            const raw = (o.ref_number || '').trim()
            if (!/^\d{1,5}$/.test(raw)) return // only consider 1-5 digit sequential refs
            const n = parseInt(raw, 10)
            if (n > maxNum) maxNum = n
          })
          setRefNumber(String(maxNum + 1).padStart(5, '0'))
        })
    }
  }, [])

  async function fetchDocs() {
    if (isNew || !id || id === 'new') return
    const { data } = await supabase.from('order_documents').select('*').eq('order_id', id)
    setOrderDocs(data || [])
  }

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    fetchDocs()
    Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('order_stops').select('*').eq('order_id', id).order('sequence'),
    ]).then(async ([orderRes, stopsRes]) => {
      if (!orderRes.data) { isDrawer ? onClose?.() : navigate('/orders'); return }
      const [advanced] = await autoAdvanceStatuses([orderRes.data], supabase)
      const o = advanced || orderRes.data
      setStatus(o.status || 'booked')
      setOrderNumber(o.order_number || '')
      setTruckId(o.truck_id || '')
      setBrokerId(o.broker_id || '')
      setEquipmentType(o.equipment_type || '')
      setLoadType(o.load_type || '')
      setDispatcher(o.dispatcher || '')
      setRefNumber(o.ref_number || '')
      setRate(o.rate ?? '')
      setApplyDiscount(o.apply_discount !== false)
      setDiscountPercent(o.discount_percent ?? 13)
      setMiles(o.miles ?? '')
      setDeadMiles(o.dead_miles ?? '')
      setInvoiceNotes(o.invoice_notes || '')
      setPuDate(o.pu_date || '')
      setPuCity(o.pu_city || '')
      setDoDate(o.do_date || '')
      setDoCity(o.do_city || '')
      setPeriodStart(o.period_start || '')
      setPeriodEnd(o.period_end || '')
      setCycleId(o.cycle_id || null)
      setCommodity(o.commodity || '')
      setWeight(o.weight ?? '')
      setSpecialInstructions(o.special_instructions || '')
      setDriverName(o.driver_name || '')

      const existingStops = stopsRes.data || []
      if (existingStops.length > 0) {
        setStops(existingStops)
      }
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (brokerId) {
      const b = allBrokers.find(x => x.id === brokerId)
      if (b) setBrokerType(b.type || 'broker')
    }
  }, [brokerId, allBrokers])

  function syncStopsToOrder(stopsArr) {
    const pickups = stopsArr.filter(s => s.type === 'pickup').sort((a, b) => a.sequence - b.sequence)
    const deliveries = stopsArr.filter(s => s.type === 'delivery').sort((a, b) => a.sequence - b.sequence)
    if (pickups.length > 0) {
      const first = pickups[0]
      if (first.city) setPuCity(first.state ? `${first.city}, ${first.state}` : first.city)
      if (first.date) setPuDate(first.date)
    }
    if (deliveries.length > 0) {
      const last = deliveries[deliveries.length - 1]
      if (last.city) setDoCity(last.state ? `${last.city}, ${last.state}` : last.city)
      if (last.date) setDoDate(last.date)
    }
  }

  function updateStop(idx, field, value) {
    setStops(prev => {
      const updated = prev.map((s, i) => i === idx ? { ...s, [field]: value } : s)
      syncStopsToOrder(updated)
      return updated
    })
  }

  function addStop() {
    setStops(prev => [...prev, { ...emptyStop(), type: 'stop', sequence: prev.length }])
  }

  function removeStop(idx) {
    if (stops.length <= 2) return
    setStops(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequence: i })))
  }

  async function calculateDH(selectedTruckId) {
    if (!selectedTruckId) return
    try {
      const orderId = isNew ? null : id
      const query = supabase.from('orders').select('do_city, do_date, id')
        .eq('truck_id', selectedTruckId)
        .not('do_date', 'is', null)
        .not('do_city', 'is', null)
        .order('do_date', { ascending: false })
        .limit(10)
      if (orderId) query.neq('id', orderId)

      const { data: prevOrders } = await query
      if (!prevOrders || prevOrders.length === 0) {
        // No previous orders — clear DH
        setDhInfo(null)
        setDeadMiles('')
        return
      }

      const thisPickup = puDate || stops.find(s => s.type === 'pickup')?.date
      if (thisPickup) {
        const prevOrder = prevOrders.find(o => o.do_date && o.do_date <= thisPickup) || prevOrders[0]
        if (prevOrder?.do_city) {
          const firstPickup = stops.find(s => s.type === 'pickup')
          const pickupLoc = firstPickup ? [firstPickup.city, firstPickup.state].filter(Boolean).join(', ') : puCity
          if (pickupLoc) {
            const dh = await calculateTruckRoute(prevOrder.do_city, pickupLoc)
            if (dh) {
              setDhInfo(dh)
              setDeadMiles(String(dh.distanceMiles))
              return
            }
          }
        }
      }
      // No valid calculation — clear DH
      setDhInfo(null)
      setDeadMiles('')
    } catch (_) { /* silent — DH is secondary */ }
  }

  async function autoCalculateRoute(stopsArr) {
    const locs = (stopsArr || stops)
      .filter(s => s.city || s.address)
      .map(s => s.address || [s.city, s.state].filter(Boolean).join(', '))
    if (locs.length < 2) return
    try {
      const route = await calculateMultiStopRoute(locs)
      if (route) {
        setRouteInfo(route)
        setMiles(String(route.totalMiles))
      }
    } catch (_) { /* silent */ }
  }

  async function calculateRoute() {
    // Build stop locations — use address if city is empty
    const stopLocations = stops
      .filter(s => s.city || s.address)
      .map(s => {
        if (s.address) return s.address
        return [s.city, s.state].filter(Boolean).join(', ')
      })

    if (stopLocations.length < 2) {
      toast.warning('Necesitas al menos 2 paradas con ciudad o direccion para calcular la ruta')
      return
    }

    setCalculatingRoute(true)
    try {
      // Calculate loaded miles (between stops)
      const route = await calculateMultiStopRoute(stopLocations)
      if (route) {
        setRouteInfo(route)
        setMiles(String(route.totalMiles))
        toast.success(`Ruta calculada: ${route.totalMiles.toLocaleString()} mi (${formatDuration(route.totalMinutes)})`)
      } else {
        toast.error('No se pudo calcular la ruta. Verifica las ciudades.')
      }

      // Calculate DH
      if (truckId) await calculateDH(truckId)
    } catch (err) {
      toast.error('Error calculando ruta: ' + (err.message || err))
    } finally {
      setCalculatingRoute(false)
    }
  }

  function handleRcFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.warning('Solo se aceptan imagenes o PDF')
      return
    }
    setRcFile(file)
    if (rcPreviewUrl) URL.revokeObjectURL(rcPreviewUrl)
    setRcPreviewUrl(URL.createObjectURL(file))
    // Auto-scan to extract data
    if (!isScannerBusy()) handleScan(file, true)
  }

  async function handleScan(file, skipRcStore = false) {
    if (!file || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) return
    if (isScannerBusy()) return

    // Store as RC if called from scan button (not from handleRcFile)
    if (!skipRcStore) {
      setRcFile(file)
      if (rcPreviewUrl) URL.revokeObjectURL(rcPreviewUrl)
      setRcPreviewUrl(URL.createObjectURL(file))
    }

    setScanning(true)
    toast.info('Leyendo Rate Confirmation... Esto puede tardar unos segundos.')
    try {
      const res = await analyzeReceipt(file)
      if (res.data) {
        const d = res.data
        if (d.order_number) setOrderNumber(d.order_number)
        if (d.ref_number) setRefNumber(d.ref_number)
        if (d.pu_date) setPuDate(d.pu_date)
        if (d.pu_city) setPuCity(d.pu_city)
        if (d.do_date) setDoDate(d.do_date)
        if (d.do_city) setDoCity(d.do_city)
        if (d.miles) setMiles(String(d.miles))
        if (d.rate) setRate(String(d.rate))
        if (d.equipment_type) setEquipmentType(d.equipment_type)
        if (d.commodity) setCommodity(d.commodity)
        if (d.weight) setWeight(String(d.weight))
        if (d.special_instructions) setSpecialInstructions(d.special_instructions)

        // Auto-fill broker — auto-save if new
        if (d.broker && d.broker.name) {
          const existing = allBrokers.find(b => b.name.toLowerCase() === d.broker.name.toLowerCase())
          if (existing) {
            setBrokerId(existing.id)
          } else {
            const brokerRecord = {
              type: 'broker',
              name: d.broker.name,
              mc_number: d.broker.mc_number || null,
              dot_number: d.broker.dot_number || null,
              ref_number: d.broker.ref_number || null,
              address: d.broker.address || null,
              phone: d.broker.phone || null,
              email: d.broker.email || null,
            }
            const { data: saved, error } = await supabase.from('brokers').insert(brokerRecord).select().single()
            if (saved && !error) {
              setBrokerId(saved.id)
              setAllBrokers(prev => [...prev, saved])
              toast.success(`Broker "${saved.name}" guardado automaticamente`)
            } else {
              // Fallback: show form manually
              setNewBroker({ name: d.broker.name, mc_number: d.broker.mc_number || '', dot_number: d.broker.dot_number || '', ref_number: d.broker.ref_number || '', address: d.broker.address || '', phone: d.broker.phone || '', email: d.broker.email || '' })
              setShowNewBroker(true)
            }
          }
        }

        // Auto-fill stops + auto-calculate loaded miles
        if (d.stops && d.stops.length > 0) {
          const newStops = d.stops.map((s, i) => ({
            ...emptyStop(),
            type: s.type === 'delivery' ? 'delivery' : 'pickup',
            location_name: s.location_name || '',
            address: s.address || '',
            city: s.city || '',
            state: s.state || '',
            date: s.date || '',
            time: s.time || '',
            time_end: s.time_end || '',
            schedule_type: s.schedule_type || 'range',
            ref_number: s.ref_number || '',
            notes: s.notes || '',
            sequence: i,
          }))
          setStops(newStops)
          autoCalculateRoute(newStops)
        }

        // Auto-fill invoicing from rate_items
        if (d.rate_items && d.rate_items.length > 0) {
          setInvoiceItems(d.rate_items.filter(r => r.amount > 0).map(r => ({
            ...emptyInvoiceItem(),
            pay_item: r.description || 'Flat Rate',
            units_type: 'Gross',
            units: 1,
            rate: r.amount,
            total: r.amount,
          })))
          // Open the section
          setSections(p => ({ ...p, invoicing: true }))
        }

        // Auto-fill commodities
        if (d.commodity) {
          setCommodities([{
            ...emptyCommodity(),
            name: d.commodity,
            qty: 1,
            weight: d.weight || '',
          }])
          setSections(p => ({ ...p, commodities: true }))
        }

        setDirty(true)
        toast.success('Datos extraidos correctamente. Recuerda presionar Guardar.')
        toast.warning('Los datos no se guardan automaticamente. Presiona Guardar antes de salir.')
      }
    } catch (err) {
      toast.error(friendlyError(err.message))
    } finally {
      setScanning(false)
      if (scanRef.current) scanRef.current.value = ''
    }
  }

  async function uploadRcToStorage(orderId) {
    if (!rcFile) return
    try {
      const ext = rcFile.name.split('.').pop()
      const filePath = `${orderId}/RC_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('order-docs').upload(filePath, rcFile)
      if (uploadError) throw uploadError
      await supabase.from('order_documents').insert({
        order_id: orderId,
        doc_type: 'RC',
        file_name: rcFile.name,
        file_path: filePath,
        file_size: rcFile.size,
        mime_type: rcFile.type,
      })
    } catch (err) {
      console.error('RC upload error:', err)
    }
  }

  async function createBroker() {
    if (!newBroker.name.trim()) { toast.warning('Nombre del broker es requerido'); return }
    try {
      const { data, error } = await supabase.from('brokers').insert({
        ...newBroker,
        type: brokerType,
        name: newBroker.name.trim(),
      }).select().single()
      if (error) throw error
      setAllBrokers(prev => [...prev, data])
      setBrokerId(data.id)
      setShowNewBroker(false)
      setNewBroker({ name: '', mc_number: '', dot_number: '', ref_number: '', address: '', phone: '', email: '' })
      toast.success('Broker creado')
    } catch (err) {
      toast.error(friendlyError(err.message))
    }
  }

  async function handleSave() {
    if (!orderNumber.trim()) { toast.warning('Orden # es requerido'); return }
    if (isNew && !dispatcher.trim()) { toast.warning('Dispatcher es requerido'); return }
    // truck_id is optional — no truck = booked status
    if (!rate && rate !== 0) { toast.warning('Rate es requerido'); return }

    setSaving(true)
    try {
      const pStart = periodStart || puDate || new Date().toISOString().split('T')[0]
      const pEnd = periodEnd || doDate || pStart

      // For new orders with a truck, ensure we use the active cycle
      const finalCycleId = (isNew && truckId) ? await getActiveCycleId(truckId) : (cycleId || null)
      const record = {
        order_number: orderNumber.trim(),
        truck_id: truckId || null,
        broker_id: brokerId || null,
        cycle_id: finalCycleId,
        status,
        equipment_type: equipmentType || null,
        load_type: loadType || null,
        dispatcher: dispatcher.trim() || null,
        ref_number: refNumber.trim() || null,
        rate: rate !== '' ? Number(rate) : 0,
        apply_discount: applyDiscount,
        miles: miles !== '' ? Number(miles) : 0,
        dead_miles: deadMiles !== '' ? Number(deadMiles) : 0,
        invoice_notes: invoiceNotes.trim() || null,
        commodity: commodity.trim() || null,
        weight: weight !== '' ? Number(weight) : 0,
        special_instructions: specialInstructions.trim() || null,
        driver_name: driverName.trim() || null,
        pu_date: puDate || null,
        pu_city: puCity.trim() || null,
        do_date: doDate || null,
        do_city: doCity.trim() || null,
        period_start: pStart,
        period_end: pEnd,
        paid: status === 'paid',
      }

      let orderId = id
      if (isNew) {
        const truck = trucks.find(t => t.id === truckId)
        record.discount_percent = truck?.discount_percent ?? 13

        const { data: existing } = await supabase.from('orders').select('id')
          .eq('truck_id', truckId).eq('order_number', record.order_number).limit(1)
        if (existing && existing.length > 0) {
          const ok = await toast.confirm(`Ya existe una orden "${record.order_number}" para este camion. ¿Crear de todas formas?`)
          if (!ok) { setSaving(false); return }
        }

        const { data, error } = await supabase.from('orders').insert(record).select().single()
        if (error) throw error
        orderId = data.id
      } else {
        const { error } = await supabase.from('orders').update(record).eq('id', id)
        if (error) throw error
      }

      // Save stops
      if (!isNew) {
        await supabase.from('order_stops').delete().eq('order_id', orderId)
      }
      const stopsToSave = stops
        .filter(s => s.city || s.address || s.date || s.location_name)
        .map((s, i) => ({
          order_id: orderId,
          type: s.type,
          location_name: s.location_name || null,
          address: s.address || null,
          city: s.city || null,
          state: s.state || null,
          date: s.date || null,
          time: s.time || null,
          time_end: s.time_end || null,
          schedule_type: s.schedule_type || 'range',
          ref_number: s.ref_number || null,
          sequence: i,
          notes: s.notes || null,
        }))
      if (stopsToSave.length > 0) {
        const { error } = await supabase.from('order_stops').insert(stopsToSave)
        if (error) throw error
      }

      // Upload RC if pending
      if (rcFile) await uploadRcToStorage(orderId)

      setDirty(false)
      toast.success(isNew ? 'Orden creada' : 'Orden actualizada')
      if (isDrawer) {
        onSaved?.()
      } else {
        navigate(`/orders/${orderId}`, { replace: true })
        if (isNew) window.location.reload()
      }
    } catch (err) {
      toast.error(friendlyError(err.message || err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ok = await toast.confirm('¿Eliminar esta orden? Esta accion no se puede deshacer.')
    if (!ok) return
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) { toast.error(friendlyError(error.message)); return }
    toast.success('Orden eliminada')
    isDrawer ? onClose?.() : navigate('/orders')
    if (isDrawer) onSaved?.()
  }

  const hasPod = orderDocs.some(d => d.doc_type === 'POD')

  async function handlePodUpload(file) {
    if (!file || !id || isNew) return
    setShowPodUpload(false)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `${id}/POD_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('order-docs').upload(filePath, file)
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('order_documents').insert({
        order_id: id, doc_type: 'POD', file_name: file.name,
        file_path: filePath, file_size: file.size, mime_type: file.type,
      })
      if (dbErr) throw dbErr
      await fetchDocs()
      toast.success('POD subido correctamente')
    } catch (err) {
      toast.error(friendlyError(err.message || err))
    }
  }

  async function handleStatusChange(newStatus) {
    // invoiced only via email send, not manual status change
    if (newStatus === 'invoiced') {
      if (!hasPod) {
        setShowPodUpload(true)
        toast.warning('Se requiere POD para facturar. Sube el Proof of Delivery.')
      } else {
        setShowInvoice(true)
      }
      return
    }
    // TONU — show price input modal
    if (newStatus === 'tonu') {
      setShowTonuModal(true)
      return
    }
    setStatus(newStatus)
    if (!isNew) {
      const updates = { status: newStatus }
      if (newStatus === 'paid') updates.paid = true
      if (newStatus !== 'paid' && newStatus !== 'tonu') updates.paid = false
      await supabase.from('orders').update(updates).eq('id', id)
    }
  }

  const rateNum = Number(rate) || 0
  const netoPreview = applyDiscount ? rateNum * (1 - discountPercent / 100) : rateNum
  const selectedBroker = allBrokers.find(b => b.id === brokerId)
  const nextStatus = getNextStatus(status)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-800 rounded w-64 animate-pulse" />
        <div className="h-96 bg-gray-800 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button onClick={async () => {
            if (dirty) {
              const ok = await toast.confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')
              if (!ok) return
            }
            isDrawer ? onClose?.() : navigate('/orders')
          }} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {isDrawer
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              }
            </svg>
          </button>
          <h1 className="text-lg sm:text-xl font-bold text-white truncate">
            {isNew ? 'Nueva Orden' : `Orden ${orderNumber}`}
          </h1>
        </div>
        <div className="flex gap-1.5 sm:gap-2 ml-8 sm:ml-0">
          <button
            type="button"
            onClick={() => scanRef.current?.click()}
            disabled={scanning}
            className="px-2 sm:px-3 py-1.5 bg-purple-600/20 border border-purple-600/50 text-purple-300 rounded-lg text-xs font-medium hover:bg-purple-600/30 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {scanning ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
              </svg>
            )}
            <span className="hidden sm:inline">{scanning ? 'Analizando...' : 'Escanear'}</span>
          </button>
          <input ref={scanRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleScan(e.target.files[0])} />
          {!isNew && (
            <button onClick={handleDelete} className="px-2 sm:px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-600/30 transition-colors">
              <span className="hidden sm:inline">Eliminar</span>
              <svg className="w-3.5 h-3.5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          )}
          {!isNew && (status === 'invoiced' || status === 'paid' || (status === 'delivered' && hasPod)) && (
            <button
              onClick={() => setShowInvoice(true)}
              className="px-2 sm:px-3 py-1.5 bg-emerald-600/20 border border-emerald-600/50 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-600/30 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="hidden sm:inline">{status === 'delivered' ? 'Generar Factura' : 'Invoice'}</span>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 sm:px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Status bar — always visible at top */}
      <div className={`bg-gray-900 border rounded-xl p-3 ${isTerminalStatus(status) ? STATUS_CONFIG[status].border : 'border-gray-800'}`}>
        {isTerminalStatus(status) ? (
          /* Terminal status display */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${status === 'tonu' ? 'bg-red-500' : 'bg-gray-500'}`} />
              <span className={`text-sm font-semibold ${STATUS_CONFIG[status].text}`}>{STATUS_CONFIG[status].label}</span>
              {status === 'tonu' && (
                <span className="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded-lg font-medium">
                  +{fmt(Number(rate) || 150)}
                </span>
              )}
            </div>
            <button
              onClick={() => handleStatusChange('booked')}
              className="px-3 py-1 bg-gray-800 text-gray-400 rounded-lg text-[11px] font-medium hover:text-white transition-colors"
            >
              Reactivar
            </button>
          </div>
        ) : (
          /* Normal flow progress bar */
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              {STATUS_ORDER.map((s, i) => {
                const reached = STATUS_ORDER.indexOf(status) >= i
                const isCurrent = status === s
                const cfg = STATUS_CONFIG[s]
                const dotColors = { blue: 'bg-blue-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500', cyan: 'bg-cyan-500', green: 'bg-emerald-500', violet: 'bg-violet-500' }
                const lineColors = { blue: 'bg-blue-500/50', yellow: 'bg-yellow-500/50', orange: 'bg-orange-500/50', cyan: 'bg-cyan-500/50', green: 'bg-emerald-500/50', violet: 'bg-violet-500/50' }
                return (
                  <div key={s} className="flex items-center flex-1">
                    <button
                      onClick={() => handleStatusChange(s)}
                      className="flex items-center gap-1 sm:gap-1.5 group"
                      title={cfg.label}
                    >
                      <div className={`w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full transition-all ${reached ? dotColors[cfg.color] : 'bg-gray-700'} ${isCurrent ? 'ring-2 ring-offset-1 ring-offset-gray-900 ring-' + cfg.color + '-500/50 scale-110' : ''}`} />
                      <span className={`text-[9px] sm:text-[11px] font-medium hidden sm:inline ${isCurrent ? cfg.text : reached ? 'text-gray-400' : 'text-gray-600'} group-hover:text-gray-300 transition-colors`}>
                        {cfg.label}
                      </span>
                    </button>
                    {i < STATUS_ORDER.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-0.5 sm:mx-1 rounded ${reached && STATUS_ORDER.indexOf(status) > i ? lineColors[cfg.color] : 'bg-gray-800'}`} />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              {/* Advance button */}
              {nextStatus ? (
                <button
                  onClick={() => handleStatusChange(nextStatus)}
                  className={`px-3 py-1 ${STATUS_CONFIG[nextStatus].bg} ${STATUS_CONFIG[nextStatus].text} border ${STATUS_CONFIG[nextStatus].border} rounded-lg text-[11px] font-medium hover:brightness-125 transition-all flex items-center gap-1`}
                >
                  {nextStatus === 'invoiced' ? 'Generar Factura' : STATUS_CONFIG[nextStatus].label}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              ) : <div />}

              {/* Terminal status buttons */}
              <div className="flex gap-1">
                <button
                  onClick={() => handleStatusChange('tonu')}
                  className="px-2 py-1 bg-red-900/30 text-red-400 border border-red-800/40 rounded-lg text-[10px] font-medium hover:bg-red-900/50 transition-colors"
                  title="Truck Order Not Used"
                >
                  TONU
                </button>
                <button
                  onClick={() => handleStatusChange('canceled')}
                  className="px-2 py-1 bg-gray-800/60 text-gray-500 border border-gray-700/50 rounded-lg text-[10px] font-medium hover:text-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* POD Upload prompt */}
      {showPodUpload && (
        <div className="bg-orange-900/20 border border-orange-700/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span className="text-sm font-medium text-orange-300">Se requiere POD para facturar</span>
          </div>
          <p className="text-xs text-gray-400">Sube el Proof of Delivery para poder marcar esta orden como facturada.</p>
          <div className="flex gap-2">
            <button
              onClick={() => podFileRef.current?.click()}
              className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-500 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              Subir POD
            </button>
            <button onClick={() => setShowPodUpload(false)} className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:text-white transition-colors">
              Cancelar
            </button>
          </div>
          <input ref={podFileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handlePodUpload(e.target.files[0])} />
        </div>
      )}

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column — main content (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Orden details */}
          <Section title="Detalles de Orden" open={sections.order} onToggle={() => toggle('order')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Orden #" value={orderNumber} onChange={setOrderNumber} required />
              <Field label="Ref #" value={refNumber} onChange={setRefNumber} />

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Camion</label>
                <select
                  value={truckId}
                  onChange={async (e) => {
                    const val = e.target.value
                    if (val) {
                      // Check active cycle and auto-assign cycle_id
                      const activeCycle = await getActiveCycle(val)
                      if (!activeCycle) {
                        const t = trucks.find(x => x.id === val)
                        toast.warning(`El truck ${t?.number || ''} no tiene un ciclo activo. Abre un ciclo primero.`)
                        return
                      }
                      setCycleId(activeCycle.id)
                    } else {
                      setCycleId(null)
                    }
                    setTruckId(val)
                    const t = trucks.find(x => x.id === val)
                    if (t) setDiscountPercent(t.discount_percent || 13)
                    // Auto-fill driver name from truck
                    if (t) setDriverName(t.name || '')
                    // Auto-advance: booked → assigned when truck is selected
                    if (val && status === 'booked') setStatus('assigned')
                    // Auto-revert: assigned → booked when truck is removed
                    if (!val && status === 'assigned') setStatus('booked')
                    // Auto-calculate DH + loaded miles
                    if (val) { calculateDH(val); autoCalculateRoute() }
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>{t.number} - {t.name}</option>
                  ))}
                </select>
              </div>

              <Field label="Dispatcher" value={dispatcher} onChange={setDispatcher} />

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Tipo Equipo</label>
                <select
                  value={equipmentType}
                  onChange={(e) => setEquipmentType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Tipo Carga</label>
                <select
                  value={loadType}
                  onChange={(e) => setLoadType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {LOAD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <Field label="Rate ($)" value={rate} onChange={setRate} type="number" step="0.01" required />
              <Field label="Miles" value={miles} onChange={setMiles} type="number" step="0.01" />
              <Field label="Dead Head" value={deadMiles} onChange={setDeadMiles} type="number" step="0.01" />

              {/* Discount toggle compact */}
              <div className={`sm:col-span-2 rounded-lg p-2.5 border transition-colors ${
                applyDiscount ? 'bg-orange-900/20 border-orange-800/40' : 'bg-gray-800/40 border-gray-700'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-medium text-gray-300">Descuento ({discountPercent}%)</p>
                    {rateNum > 0 && (
                      <p className="text-[11px] text-gray-500">
                        {fmt(rateNum)} → <span className="text-gray-400">{fmt(netoPreview)}</span>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setApplyDiscount(v => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      applyDiscount ? 'bg-orange-500' : 'bg-gray-600'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      applyDiscount ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-400 mb-1">Notas</label>
                <textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>
          </Section>

          {/* Stops */}
          <Section title="Paradas" open={sections.stops} onToggle={() => toggle('stops')}>
            <div className="space-y-2">
              {stops.map((stop, idx) => (
                <div key={idx} className={`rounded-lg border p-2.5 ${
                  stop.type === 'pickup' ? 'border-blue-800/40 bg-blue-900/10' :
                  stop.type === 'delivery' ? 'border-green-800/40 bg-green-900/10' :
                  'border-gray-700 bg-gray-800/30'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={stop.type}
                        onChange={(e) => updateStop(idx, 'type', e.target.value)}
                        className="bg-transparent border-none text-xs font-medium focus:outline-none cursor-pointer text-gray-300"
                      >
                        <option value="pickup">Pickup</option>
                        <option value="delivery">Delivery</option>
                        <option value="stop">Parada</option>
                      </select>
                      <span className="text-[10px] text-gray-600">#{idx + 1}</span>
                    </div>
                    {stops.length > 2 && (
                      <button onClick={() => removeStop(idx)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {/* Row 1: Address + Location Name */}
                    <input placeholder="Direccion" value={stop.address || ''} onChange={(e) => updateStop(idx, 'address', e.target.value)} autoComplete="one-time-code"
                      className="col-span-3 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                    <input placeholder="Location Name" value={stop.location_name || ''} onChange={(e) => updateStop(idx, 'location_name', e.target.value)} autoComplete="one-time-code"
                      className="col-span-3 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                    {/* Row 2: City, State, Date, Time From, Time To, Schedule */}
                    <input placeholder="Ciudad" value={stop.city || ''} onChange={(e) => updateStop(idx, 'city', e.target.value)} autoComplete="one-time-code"
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                    <input placeholder="ST" value={stop.state || ''} onChange={(e) => updateStop(idx, 'state', e.target.value)} autoComplete="one-time-code"
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                    <input type="date" value={stop.date || ''} onChange={(e) => updateStop(idx, 'date', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                    <input type="time" value={stop.time || ''} onChange={(e) => {
                      updateStop(idx, 'time', e.target.value)
                      if (e.target.value && e.target.value === stop.time_end) updateStop(idx, 'schedule_type', 'appointment')
                      else if (e.target.value && stop.time_end && e.target.value !== stop.time_end) updateStop(idx, 'schedule_type', 'range')
                    }}
                      title="Hora inicio"
                      className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                    <input type="time" value={stop.time_end || ''} onChange={(e) => {
                      updateStop(idx, 'time_end', e.target.value)
                      if (e.target.value && e.target.value === stop.time) updateStop(idx, 'schedule_type', 'appointment')
                      else if (e.target.value && stop.time && e.target.value !== stop.time) updateStop(idx, 'schedule_type', 'range')
                    }}
                      title="Hora fin"
                      className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                    <button type="button" onClick={() => updateStop(idx, 'schedule_type', stop.schedule_type === 'appointment' ? 'range' : 'appointment')}
                      className={`px-1.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                        stop.schedule_type === 'appointment'
                          ? 'bg-purple-900/40 text-purple-400 border-purple-700/50'
                          : 'bg-cyan-900/40 text-cyan-400 border-cyan-700/50'
                      }`}
                    >{stop.schedule_type === 'appointment' ? 'Cita' : 'Rango'}</button>
                    {/* Row 3: Ref + Notes */}
                    <input placeholder="Ref #" value={stop.ref_number || ''} onChange={(e) => updateStop(idx, 'ref_number', e.target.value)}
                      className="col-span-2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                    <input placeholder="Notas" value={stop.notes || ''} onChange={(e) => updateStop(idx, 'notes', e.target.value)}
                      className="col-span-4 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <button
                  onClick={addStop}
                  className="flex-1 px-3 py-1.5 border border-dashed border-gray-700 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
                >
                  + Agregar Parada
                </button>
                <button
                  onClick={calculateRoute}
                  disabled={calculatingRoute}
                  className="px-4 py-1.5 bg-cyan-600/20 border border-cyan-600/50 text-cyan-300 rounded-lg text-xs font-medium hover:bg-cyan-600/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {calculatingRoute ? (
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                    </svg>
                  )}
                  {calculatingRoute ? 'Calculando...' : 'Calcular Ruta'}
                </button>
              </div>

              {/* Route result */}
              {routeInfo && (
                <div className="bg-cyan-900/20 border border-cyan-800/40 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span className="text-xs text-cyan-400 font-medium">Ruta truck calculada</span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div>
                      <span className="text-gray-500">Loaded:</span>
                      <span className="text-white font-semibold ml-1">{routeInfo.totalMiles.toLocaleString()} mi</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Tiempo:</span>
                      <span className="text-gray-300 ml-1">{formatDuration(routeInfo.totalMinutes)}</span>
                    </div>
                    {routeInfo.legs && routeInfo.legs.length > 1 && (
                      <div>
                        <span className="text-gray-500">Tramos:</span>
                        <span className="text-gray-300 ml-1">{routeInfo.legs.length}</span>
                      </div>
                    )}
                  </div>
                  {dhInfo && (
                    <div className="flex gap-4 text-xs border-t border-cyan-800/30 pt-2 mt-1">
                      <div>
                        <span className="text-gray-500">Dead Head:</span>
                        <span className="text-orange-400 font-semibold ml-1">{dhInfo.distanceMiles.toLocaleString()} mi</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Tiempo DH:</span>
                        <span className="text-gray-300 ml-1">{formatDuration(dhInfo.durationMinutes)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Miles fields */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Field label="Loaded Miles" value={miles} onChange={setMiles} type="number" step="0.01" />
                <Field label="Dead Head Miles" value={deadMiles} onChange={setDeadMiles} type="number" step="0.01" />
              </div>
            </div>
          </Section>

          {/* Invoicing */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5">
              <button onClick={() => toggle('invoicing')} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 text-[11px] font-bold flex items-center justify-center">5</span>
                <h2 className="text-sm font-semibold text-white">Invoicing</h2>
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setInvoiceItems(prev => [...prev, emptyInvoiceItem()])}
                  className="text-blue-400 text-xs font-medium hover:text-blue-300 transition-colors flex items-center gap-1">
                  + Add Line Item
                </button>
                <button onClick={() => toggle('invoicing')} className="text-gray-500">
                  <svg className={`w-4 h-4 transition-transform ${sections.invoicing ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
            </div>
            {sections.invoicing && (
              <div className="px-4 pb-4 space-y-3">
                <div className="text-xs text-gray-500 cursor-pointer" onClick={() => { if (!specialInstructions) setSpecialInstructions(' ') }}>
                  <p className="font-medium text-gray-400">Invoice Note</p>
                  {specialInstructions ? (
                    <textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)}
                      rows={2} className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500 resize-none" />
                  ) : (
                    <p className="text-gray-600 text-[11px]">Click to add special instructions or notes related to the invoice</p>
                  )}
                </div>

                {invoiceItems.length > 0 && (
                  <div className="border border-gray-700 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 bg-gray-800/50">
                          <th className="px-3 py-2">PAY ITEM</th>
                          <th className="px-3 py-2" colSpan={2}>UNITS</th>
                          <th className="px-3 py-2">RATE</th>
                          <th className="px-3 py-2 text-right">TOTAL</th>
                          <th className="py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceItems.map((item, idx) => (
                          <tr key={idx} className="border-t border-gray-700">
                            <td className="px-3 py-2">
                              <select value={item.pay_item} onChange={(e) => {
                                const u = [...invoiceItems]; u[idx] = { ...u[idx], pay_item: e.target.value }; setInvoiceItems(u)
                              }} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500">
                                {INVOICE_ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="py-2 pl-3">
                              <select value={item.units_type} onChange={(e) => {
                                const u = [...invoiceItems]; u[idx] = { ...u[idx], units_type: e.target.value }; setInvoiceItems(u)
                              }} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500">
                                {UNITS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="py-2 px-1">
                              <input type="number" value={item.units} onChange={(e) => {
                                const u = [...invoiceItems]; const units = Number(e.target.value) || 0
                                u[idx] = { ...u[idx], units, total: units * (Number(u[idx].rate) || 0) }; setInvoiceItems(u)
                              }} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 text-right w-12 focus:outline-none focus:border-blue-500" />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center">
                                <span className="text-gray-600 text-xs mr-1">$</span>
                                <input type="number" step="0.01" value={item.rate} onChange={(e) => {
                                  const u = [...invoiceItems]; const rate = Number(e.target.value) || 0
                                  u[idx] = { ...u[idx], rate, total: (Number(u[idx].units) || 1) * rate }; setInvoiceItems(u)
                                }} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 text-right w-20 focus:outline-none focus:border-blue-500" />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-white font-medium">
                              {fmt(Number(item.total) || 0)}
                            </td>
                            <td className="py-2 pr-2">
                              <button onClick={() => setInvoiceItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-gray-600 hover:text-red-400 transition-colors p-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex justify-end px-3 py-2 bg-gray-800/30 border-t border-gray-700">
                      <span className="text-xs text-gray-500">Total:</span>
                      <span className="text-sm text-green-400 font-semibold ml-2">
                        {fmt(invoiceItems.reduce((s, p) => s + (Number(p.total) || 0), 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Commodities */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5">
              <button onClick={() => toggle('commodities')} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 text-[11px] font-bold flex items-center justify-center">6</span>
                <h2 className="text-sm font-semibold text-white">Commodities</h2>
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setCommodities(prev => [...prev, emptyCommodity()])}
                  className="text-blue-400 text-xs font-medium hover:text-blue-300 transition-colors flex items-center gap-1">
                  + Add Commodity
                </button>
                <button onClick={() => toggle('commodities')} className="text-gray-500">
                  <svg className={`w-4 h-4 transition-transform ${sections.commodities ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
            </div>
            {sections.commodities && (
              <div className="px-4 pb-4">
                {commodities.length > 0 ? (
                  <div className="border border-gray-700 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 bg-gray-800/50">
                          <th className="px-3 py-2">NAME</th>
                          <th className="px-3 py-2">QTY</th>
                          <th className="px-3 py-2">TYPE</th>
                          <th className="px-3 py-2">DIMENSIONS</th>
                          <th className="px-3 py-2">WEIGHT</th>
                          <th className="py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {commodities.map((item, idx) => (
                          <tr key={idx} className="border-t border-gray-700">
                            <td className="px-3 py-2">
                              <input value={item.name} onChange={(e) => {
                                const u = [...commodities]; u[idx] = { ...u[idx], name: e.target.value }; setCommodities(u)
                              }} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 w-full focus:outline-none focus:border-blue-500" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" value={item.qty} onChange={(e) => {
                                const u = [...commodities]; u[idx] = { ...u[idx], qty: e.target.value }; setCommodities(u)
                              }} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 text-right w-12 focus:outline-none focus:border-blue-500" />
                            </td>
                            <td className="px-3 py-2">
                              <select value={item.type} onChange={(e) => {
                                const u = [...commodities]; u[idx] = { ...u[idx], type: e.target.value }; setCommodities(u)
                              }} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500">
                                {COMMODITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input value={item.dimensions} onChange={(e) => {
                                const u = [...commodities]; u[idx] = { ...u[idx], dimensions: e.target.value }; setCommodities(u)
                              }} placeholder="- x - x -"
                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 w-24 focus:outline-none focus:border-blue-500" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="0.1" value={item.weight} onChange={(e) => {
                                const u = [...commodities]; u[idx] = { ...u[idx], weight: e.target.value }; setCommodities(u)
                              }} placeholder="lbs"
                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 text-right w-24 focus:outline-none focus:border-blue-500" />
                            </td>
                            <td className="py-2 pr-2">
                              <button onClick={() => setCommodities(prev => prev.filter((_, i) => i !== idx))}
                                className="text-gray-600 hover:text-red-400 transition-colors p-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex justify-end px-3 py-2 bg-gray-800/30 border-t border-gray-700">
                      <span className="text-xs text-gray-500">Total:</span>
                      <span className="text-sm text-gray-300 font-semibold ml-2">
                        {commodities.reduce((s, c) => s + (Number(c.weight) || 0), 0).toLocaleString()} Lb
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 text-center py-3">Sin commodities.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — sidebar (1/3) */}
        <div className="space-y-4">
          {/* Quick info card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resumen</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Rate</span>
                <span className="text-green-400 font-semibold">{fmt(rateNum)}</span>
              </div>
              {applyDiscount && rateNum > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Neto</span>
                  <span className="text-gray-300 font-medium">{fmt(netoPreview)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Miles</span>
                <span className="text-gray-300">{Number(miles || 0).toLocaleString()}</span>
              </div>
              {Number(deadMiles || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Dead Head</span>
                  <span className="text-gray-500">{Number(deadMiles).toLocaleString()}</span>
                </div>
              )}
              {rateNum > 0 && Number(miles) > 0 && (
                <>
                  <div className="border-t border-gray-800 pt-2 flex justify-between text-sm">
                    <span className="text-gray-500">RPM</span>
                    <span className="text-blue-400 font-medium">${(netoPreview / Number(miles)).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Broker section */}
          <Section title="Cliente / Broker" open={sections.client} onToggle={() => toggle('client')}>
            <div className="space-y-3">
              {/* Selected broker display */}
              {selectedBroker && !showNewBroker ? (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{selectedBroker.name}</p>
                      <div className="mt-1 space-y-0.5 text-[11px] text-gray-400">
                        {selectedBroker.mc_number && <div>MC# <span className="text-gray-300">{selectedBroker.mc_number}</span></div>}
                        {selectedBroker.dot_number && <div>DOT# <span className="text-gray-300">{selectedBroker.dot_number}</span></div>}
                        {selectedBroker.phone && <div>Tel: <span className="text-gray-300">{selectedBroker.phone}</span></div>}
                        {selectedBroker.email && <div>{selectedBroker.email}</div>}
                      </div>
                    </div>
                    <button onClick={() => { setBrokerId(''); setShowNewBroker(true) }} className="text-gray-600 hover:text-red-400 transition-colors p-0.5" title="Cambiar broker">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : !showNewBroker ? (
                <button
                  onClick={() => setShowNewBroker(true)}
                  className="w-full py-2 border border-dashed border-gray-700 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
                >
                  + Asignar Broker
                </button>
              ) : null}

              {showNewBroker && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
                  {/* FMCSA autocomplete search */}
                  <div className="relative">
                    <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                      </svg>
                      <input
                        placeholder="Buscar broker..."
                        autoComplete="one-time-code"
                        value={newBroker.name}
                        onChange={(e) => {
                          const val = e.target.value
                          setNewBroker(p => ({ ...p, name: val }))
                          clearTimeout(fmcsaTimer.current)
                          if (val.length >= 2) {
                            // Instant: search local brokers first
                            const q = val.toLowerCase()
                            const localResults = allBrokers
                              .filter(b => b.name.toLowerCase().includes(q) || (b.mc_number || '').includes(q) || (b.dot_number || '').includes(q))
                              .slice(0, 5)
                              .map(b => ({ ...b, _local: true, status: 'Local' }))
                            setFmcsaSuggestions(localResults)

                            // Then FMCSA in background (debounced)
                            if (val.length >= 3) {
                              setFmcsaSearching(true)
                              fmcsaTimer.current = setTimeout(async () => {
                                try {
                                  const num = val.replace(/[^\d]/g, '')
                                  let fmcsaResults = []
                                  if (num.length >= 5) {
                                    const [mcResult, dotResult] = await Promise.all([
                                      lookupByMc(num),
                                      lookupByDot(num),
                                    ])
                                    fmcsaResults = [mcResult, dotResult].filter(Boolean)
                                  }
                                  if (fmcsaResults.length === 0) {
                                    fmcsaResults = await searchByName(val)
                                  }
                                  // Merge: local first, then FMCSA (skip duplicates)
                                  const localNames = new Set(localResults.map(l => l.name.toLowerCase()))
                                  const merged = [...localResults, ...fmcsaResults.filter(f => !localNames.has(f.name.toLowerCase()))]
                                  setFmcsaSuggestions(merged)
                                } catch { /* silent */ }
                                setFmcsaSearching(false)
                              }, 600)
                            }
                          } else {
                            setFmcsaSuggestions([])
                            setFmcsaSearching(false)
                          }
                        }}
                        className="flex-1 bg-transparent text-gray-100 text-xs focus:outline-none placeholder-gray-600"
                      />
                      {fmcsaSearching && (
                        <svg className="w-3 h-3 text-cyan-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                    </div>

                    {/* Suggestions dropdown */}
                    {fmcsaSuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {fmcsaSuggestions.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              if (s._local && s.id) {
                                // Local broker — select directly
                                setBrokerId(s.id)
                                setShowNewBroker(false)
                                setFmcsaSuggestions([])
                                toast.success(`Broker seleccionado: ${s.name}`)
                              } else {
                                setNewBroker(p => ({
                                  ...p,
                                  name: s.name,
                                  mc_number: s.mc_number || p.mc_number,
                                  dot_number: s.dot_number || p.dot_number,
                                  phone: s.phone || p.phone,
                                  address: s.address || p.address,
                                }))
                                setFmcsaSuggestions([])
                                toast.success(`${s.name} — ${s.status}`)
                              }
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700/50 transition-colors border-b border-gray-700/50 last:border-0"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-white font-medium">{s.name}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                s._local ? 'bg-blue-900/40 text-blue-400'
                                : s.status === 'Authorized' ? 'bg-emerald-900/40 text-emerald-400'
                                : 'bg-red-900/40 text-red-400'
                              }`}>
                                {s._local ? 'Guardado' : s.status}
                              </span>
                            </div>
                            <div className="flex gap-3 mt-0.5 text-[10px] text-gray-500">
                              {s.mc_number && <span>MC# {s.mc_number}</span>}
                              {s.dot_number && <span>DOT# {s.dot_number}</span>}
                              {s.city && <span>{s.city}, {s.state}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Detail fields */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <input placeholder="MC #" value={newBroker.mc_number} autoComplete="one-time-code"
                      onChange={(e) => setNewBroker(p => ({ ...p, mc_number: e.target.value }))}
                      className="bg-gray-800 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500 placeholder-gray-600" />
                    <input placeholder="DOT #" value={newBroker.dot_number} autoComplete="one-time-code"
                      onChange={(e) => setNewBroker(p => ({ ...p, dot_number: e.target.value }))}
                      className="bg-gray-800 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500 placeholder-gray-600" />
                  </div>
                  <input placeholder="Telefono" value={newBroker.phone} autoComplete="one-time-code"
                    onChange={(e) => setNewBroker(p => ({ ...p, phone: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500 placeholder-gray-600" />
                  <input placeholder="Email" value={newBroker.email} autoComplete="one-time-code"
                    onChange={(e) => setNewBroker(p => ({ ...p, email: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500 placeholder-gray-600" />
                  <input placeholder="Direccion" value={newBroker.address} autoComplete="one-time-code"
                    onChange={(e) => setNewBroker(p => ({ ...p, address: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500 placeholder-gray-600" />

                  <div className="flex gap-2 justify-end pt-1">
                    <button onClick={() => { setShowNewBroker(false); setFmcsaSuggestions([]) }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-white transition-colors">Cancelar</button>
                    <button onClick={createBroker} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors">Crear</button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Route preview */}
          {(puCity || doCity) && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Ruta</h3>
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center mt-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <div className="w-0.5 h-8 bg-gray-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-sm text-gray-200">{puCity || '-'}</p>
                    <p className="text-[11px] text-gray-600">{puDate || 'Sin fecha'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-200">{doCity || '-'}</p>
                    <p className="text-[11px] text-gray-600">{doDate || 'Sin fecha'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Documents panel — existing orders */}
          {!isNew && <OrderDocuments orderId={id} onDocsChange={fetchDocs} />}

          {/* RC upload + preview — new orders */}
          {isNew && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate Confirmation</h3>
              </div>

              {!rcPreviewUrl ? (
                <div
                  className="p-4"
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); rcDragCounter.current++; setRcDragging(true) }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); rcDragCounter.current--; if (rcDragCounter.current === 0) setRcDragging(false) }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); rcDragCounter.current = 0; setRcDragging(false); const f = e.dataTransfer.files[0]; if (f) handleRcFile(f) }}
                >
                  <button
                    onClick={() => rcFileRef.current?.click()}
                    className={`w-full py-8 border-2 border-dashed rounded-lg flex flex-col items-center gap-2 transition-colors ${
                      rcDragging
                        ? 'border-blue-500 bg-blue-600/10 text-blue-300'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-xs font-medium">{rcDragging ? 'Soltar archivo aqui' : 'Subir Rate Confirmation'}</span>
                    <span className="text-[10px] text-gray-600">Arrastra o haz click — Imagen o PDF</span>
                  </button>
                  <input
                    ref={rcFileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => handleRcFile(e.target.files[0])}
                  />
                </div>
              ) : (
                <div>
                  <div className="px-4 py-2 flex items-center justify-between bg-gray-800/30">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      <span className="text-[11px] text-blue-400 font-semibold">RC</span>
                      <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{rcFile?.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRcFullscreen(true)}
                        className="p-1 text-gray-600 hover:text-cyan-400 transition-colors"
                        title="Ver grande"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { rcFileRef.current?.click() }}
                        className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
                        title="Cambiar archivo"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { setRcFile(null); setRcPreviewUrl(null) }}
                        className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                        title="Quitar"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <input
                      ref={rcFileRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => { if (e.target.files[0]) handleRcFile(e.target.files[0]) }}
                    />
                  </div>
                  <div className="p-2 bg-gray-950">
                    {rcFile?.type?.startsWith('image/') ? (
                      <img src={rcPreviewUrl} alt="Rate Confirmation" className="w-full rounded border border-gray-800" />
                    ) : (
                      <iframe src={rcPreviewUrl} className="w-full h-[400px] rounded border border-gray-800" title="Rate Confirmation" />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Company info for invoice */}
          <CompanyInfoSidebar />
        </div>
      </div>

      {/* RC Fullscreen viewer */}
      {rcFullscreen && rcPreviewUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setRcFullscreen(false)}>
          <div className="relative w-full max-w-5xl h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setRcFullscreen(false)}
              className="absolute -top-10 right-0 text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span className="text-xs">Cerrar</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            {rcFile?.type?.startsWith('image/') ? (
              <img src={rcPreviewUrl} alt="Rate Confirmation" className="w-full h-full object-contain rounded-lg" />
            ) : (
              <iframe src={rcPreviewUrl} className="w-full h-full rounded-lg border border-gray-700" title="Rate Confirmation" />
            )}
          </div>
        </div>
      )}

      {/* TONU price modal */}
      {showTonuModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <h3 className="text-sm font-semibold text-white">TONU — Truck Order Not Used</h3>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cargo TONU (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={tonuPrice}
                  onChange={e => setTonuPrice(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2.5 text-gray-100 text-lg font-semibold focus:outline-none focus:border-red-500"
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Por defecto $150.00 — modifica si es diferente</p>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => { setShowTonuModal(false); setTonuPrice('150') }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const price = Number(tonuPrice) || 150
                  setStatus('tonu')
                  setRate(String(price))
                  setApplyDiscount(false)
                  if (!isNew) {
                    await supabase.from('orders').update({ status: 'tonu', rate: price, apply_discount: false, paid: true }).eq('id', id)
                  }
                  setShowTonuModal(false)
                  toast.success(`TONU aplicado — ${fmt(price)}`)
                }}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-500 transition-colors"
              >
                Aplicar TONU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice modal */}
      {showInvoice && <OrderInvoice orderId={id} onClose={() => setShowInvoice(false)} onEmailSent={async () => {
        if (status === 'delivered') {
          setStatus('invoiced')
          await supabase.from('orders').update({ status: 'invoiced' }).eq('id', id)
        }
      }} />}
    </div>
  )
}

function Section({ title, open, onToggle, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', step, required }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">{label}{required ? ' *' : ''}</label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}

function CompanyInfoSidebar() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dba, setDba] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    import('../lib/company').then(({ getCompanySettings }) => {
      getCompanySettings().then(s => {
        const info = s?.company_info || {}
        setName(info.company_name || '')
        setDba(info.dba || '')
      })
    })
  }, [])

  async function handleSave() {
    const { getCompanySettings, updateCompanyInfo } = await import('../lib/company')
    const s = await getCompanySettings()
    const info = { ...(s?.company_info || {}), company_name: name, dba }
    await updateCompanyInfo(info)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice - Company</h3>
        </div>
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {!open && (name || dba) && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-gray-400">{name}{dba ? ` — ${dba}` : ''}</p>
        </div>
      )}
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Company Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="ETG Moving Services"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">DBA</label>
            <input value={dba} onChange={e => setDba(e.target.value)} placeholder="Driving Is Work LLC"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-100 text-xs focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex justify-end pt-1">
            {saved ? (
              <span className="text-[11px] text-green-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Guardado
              </span>
            ) : (
              <button onClick={handleSave} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[11px] font-medium hover:bg-blue-500 transition-colors">
                Guardar
              </button>
            )}
          </div>
          <p className="text-[9px] text-gray-600">Aparece en el invoice como: {name || '...'} — {dba || '...'}</p>
        </div>
      )}
    </div>
  )
}

