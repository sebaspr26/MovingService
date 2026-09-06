import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getActiveCompanyId } from '../lib/company'
import { analyzeReceipt } from '../lib/gemini'
import { useToast, friendlyError } from './Toast'

const TYPE_LABELS = { order: 'Orden / Carga', diesel: 'Diesel', expense: 'Gasto' }
const TYPE_COLORS = { order: 'text-green-400', diesel: 'text-orange-400', expense: 'text-red-400' }

function getMonthRange(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export default function Scanner() {
  const toast = useToast()
  const [trucks, setTrucks] = useState([])
  const [selectedTruck, setSelectedTruck] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    const cId = getActiveCompanyId()
    const q = supabase.from('trucks').select('*').order('number')
    ;(cId ? q.eq('company_id', cId) : q).then(({ data }) => setTrucks(data || []))
  }, [])

  function handleFile(f) {
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setResult(null)
    setFormData({})
    setSaved(false)
    setError(null)
  }

  function handleDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('image/')) handleFile(f)
  }

  async function handleAnalyze() {
    if (!file) return
    setAnalyzing(true)
    setError(null)
    try {
      const res = await analyzeReceipt(file)
      setResult(res)
      setFormData(res.data || {})
    } catch (err) {
      setError(err.message)
      toast.error(friendlyError(err.message))
    }
    setAnalyzing(false)
  }

  async function handleSave() {
    if (!selectedTruck || !result) return
    setSaving(true)
    setError(null)
    const period = getMonthRange()
    const record = {
      ...formData,
      truck_id: selectedTruck,
      period_start: period.start,
      period_end: period.end,
    }

    const table = result.type === 'order' ? 'orders' : result.type === 'diesel' ? 'diesel' : 'expenses'
    const { error: err } = await supabase.from(table).insert(record)
    setSaving(false)
    if (err) {
      setError(err.message)
      toast.error(friendlyError(err.message))
    } else {
      setSaved(true)
      toast.success('Registro guardado exitosamente')
    }
  }

  function handleReset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setFormData({})
    setSaved(false)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function updateField(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const fieldLabels = {
    order_number: 'Orden #', pu_date: 'Fecha Pickup', pu_city: 'Ciudad Pickup',
    do_date: 'Fecha Delivery', do_city: 'Ciudad Delivery', miles: 'Millas', rate: 'Rate ($)',
    invoice_number: 'Invoice #', date: 'Fecha', city: 'Ciudad',
    gallons: 'Galones', value: 'Valor ($)',
    category: 'Categoria', description: 'Descripcion', amount: 'Monto ($)',
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Scanner</h2>
        <p className="text-sm text-gray-500 mt-1">Sube una imagen de recibo y la IA extraera los datos</p>
      </div>

      {/* Truck selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-400 mb-2">Camion destino</label>
        <select
          value={selectedTruck}
          onChange={(e) => setSelectedTruck(e.target.value)}
          className="sel bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-orange-500 w-full max-w-xs"
        >
          <option value="">Seleccionar camion...</option>
          {trucks.map(t => (
            <option key={t.id} value={t.id}>{t.name} (#{t.number})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Upload + Preview */}
        <div>
          {!preview ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center cursor-pointer hover:border-gray-500 hover:bg-gray-900/50 transition-all"
            >
              <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-gray-400 mb-1">Arrastra una imagen o haz click para subir</p>
              <p className="text-xs text-gray-600">JPG, PNG, WEBP</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <img src={preview} alt="Receipt" className="w-full max-h-96 object-contain bg-gray-950" />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {analyzing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Analizando...
                    </>
                  ) : (
                    'Analizar con IA'
                  )}
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
                >
                  Cambiar imagen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div>
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {saved && (
            <div className="bg-green-900/30 border border-green-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-400">Registro guardado exitosamente</p>
              <button onClick={handleReset} className="text-xs text-green-300 underline mt-2">
                Escanear otro recibo
              </button>
            </div>
          )}

          {result && !saved && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Datos extraidos</h3>
                <span className={`text-sm font-medium ${TYPE_COLORS[result.type]}`}>
                  {TYPE_LABELS[result.type]}
                </span>
              </div>

              <div className="space-y-3">
                {Object.entries(formData).map(([key, value]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {fieldLabels[key] || key}
                    </label>
                    {key === 'category' ? (
                      <select
                        value={value}
                        onChange={(e) => updateField(key, e.target.value)}
                        className="sel w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
                      >
                        {['Mantenimiento','Seguro','Peajes','Reparacion','Llantas','Lavado','Parqueo','Multas','Comida','Otros'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={typeof value === 'number' ? 'number' : key.includes('date') ? 'date' : 'text'}
                        step={typeof value === 'number' ? '0.01' : undefined}
                        value={value}
                        onChange={(e) => updateField(key, typeof value === 'number' ? Number(e.target.value) : e.target.value)}
                        className="sel w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-orange-500"
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleSave}
                disabled={!selectedTruck || saving}
                className="w-full mt-5 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : !selectedTruck ? 'Selecciona un camion primero' : 'Guardar registro'}
              </button>
            </div>
          )}

          {!result && !error && !saved && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-12 text-center">
              <svg className="w-10 h-10 mx-auto text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
              <p className="text-gray-600 text-sm">Sube una imagen y presiona "Analizar con IA"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
