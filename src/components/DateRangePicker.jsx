import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate() }
function getFirstDayOfMonth(year, month) { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1 }
function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function fmtShort(s) { if (!s) return ''; const d = new Date(s+'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}` }

export default function DateRangePicker({ dateFrom, dateTo, onChange, placeholder = 'Rango de fechas' }) {
  const today = new Date()
  const todayStr = fmt(today)

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [isMobile, setIsMobile] = useState(false)

  // Two-click selection: null = waiting for first click, string = waiting for second click
  const [pendingStart, setPendingStart] = useState(null)
  const [hoverDate, setHoverDate] = useState(null)

  const ref = useRef()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!open) { setPendingStart(null); setHoverDate(null); return }
    if (dateFrom) {
      const d = new Date(dateFrom + 'T00:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
    function outside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  function prevMonth() { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1)}else setViewMonth(m=>m-1) }
  function nextMonth() { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1)}else setViewMonth(m=>m+1) }

  function handleDayClick(dateStr) {
    if (!pendingStart) {
      // First click — anchor the start
      setPendingStart(dateStr)
      setHoverDate(dateStr)
    } else {
      // Second click — confirm range
      const from = pendingStart <= dateStr ? pendingStart : dateStr
      const to   = pendingStart <= dateStr ? dateStr : pendingStart
      onChange({ from, to })
      setPendingStart(null)
      setHoverDate(null)
      setOpen(false)
    }
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  // Effective range for highlighting
  // While selecting: pendingStart ↔ hoverDate preview
  // Otherwise: committed dateFrom ↔ dateTo
  const previewFrom = pendingStart && hoverDate
    ? [pendingStart, hoverDate].sort()[0]
    : null
  const previewTo = pendingStart && hoverDate
    ? [pendingStart, hoverDate].sort()[1]
    : null

  const effFrom = previewFrom ?? dateFrom ?? ''
  const effTo   = previewTo   ?? dateTo   ?? ''

  // Trigger label
  let label = null
  if (dateFrom && dateTo) {
    label = dateFrom === dateTo
      ? fmtShort(dateFrom) + ' ' + new Date(dateFrom+'T00:00:00').getFullYear()
      : `${fmtShort(dateFrom)} – ${fmtShort(dateTo)} ${new Date(dateTo+'T00:00:00').getFullYear()}`
  } else if (dateFrom) {
    label = `${fmtShort(dateFrom)} → ...`
  }

  const hasValue = !!(dateFrom || dateTo)

  const calendarNode = open && (
    <>
      {isMobile && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />}
      <div
        ref={isMobile ? null : ref}
        className={`z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3 select-none ${
          isMobile
            ? 'fixed left-4 right-4 top-1/2 -translate-y-1/2'
            : 'absolute top-full mt-1 left-0 w-[280px]'
        }`}
      >
        {/* Hint */}
        <p className="text-center text-[10px] mb-2" style={{ color: pendingStart ? '#f97316' : '#6b7280' }}>
          {pendingStart
            ? `Inicio: ${fmtShort(pendingStart)} — ahora selecciona el día final`
            : 'Clic en el primer día del rango'}
        </p>

        {/* Navegación mes */}
        <div className="flex items-center justify-between mb-3">
          <button type="button" onMouseDown={e => e.stopPropagation()} onClick={prevMonth}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-white">{MONTHS[viewMonth]} {viewYear}</span>
          <button type="button" onMouseDown={e => e.stopPropagation()} onClick={nextMonth}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* Encabezados días */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] text-gray-500 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Grilla de días */}
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = fmt(new Date(viewYear, viewMonth, day))
            const isFrom = dateStr === effFrom
            const isTo   = dateStr === effTo
            const isEndpoint = isFrom || isTo
            const isPending  = dateStr === pendingStart
            const isToday    = dateStr === todayStr
            const inRange    = effFrom && effTo && dateStr > effFrom && dateStr < effTo
            const rangeBg    = pendingStart ? 'bg-orange-500/20' : 'bg-orange-500/15'

            return (
              <div key={day} className="relative h-8 flex items-center justify-center">
                {/* Fondo de rango */}
                {inRange && <div className={`absolute inset-0 ${rangeBg}`} />}
                {isFrom && effTo && effFrom !== effTo && (
                  <div className={`absolute top-0 bottom-0 left-1/2 right-0 ${rangeBg}`} />
                )}
                {isTo && effFrom && effFrom !== effTo && (
                  <div className={`absolute top-0 bottom-0 right-1/2 left-0 ${rangeBg}`} />
                )}

                <button
                  type="button"
                  onClick={() => handleDayClick(dateStr)}
                  onMouseEnter={() => pendingStart && setHoverDate(dateStr)}
                  className={`relative z-10 w-8 h-8 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    isPending
                      ? 'bg-orange-500 text-white ring-2 ring-orange-400/50 shadow-md'
                      : isEndpoint
                        ? 'bg-orange-600 text-white shadow-md shadow-orange-900/40'
                        : isToday
                          ? 'bg-gray-800 text-blue-400 ring-1 ring-blue-500/50 hover:bg-gray-700'
                          : inRange
                            ? 'text-orange-200 hover:bg-orange-500/40 hover:text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800">
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => { onChange({ from: fmt(today), to: fmt(today) }); setPendingStart(null); setOpen(false) }}
            className="text-[10px] text-blue-400 hover:text-orange-300 transition-colors"
          >
            Hoy
          </button>
          {pendingStart && (
            <button
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { setPendingStart(null); setHoverDate(null) }}
              className="text-[10px] text-yellow-500 hover:text-yellow-400 transition-colors"
            >
              Cancelar selección
            </button>
          )}
          {hasValue && !pendingStart && (
            <button
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { onChange({ from: '', to: '' }); setOpen(false) }}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>
    </>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-left focus:outline-none focus:border-orange-500 flex items-center justify-between gap-2 transition-colors ${
          hasValue ? 'text-gray-100' : 'text-gray-500'
        }`}
      >
        <span className="truncate">{label || placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {hasValue && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange({ from: '', to: '' }) }}
              className="text-gray-600 hover:text-gray-400 cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg className={`w-3 h-3 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {isMobile ? createPortal(calendarNode, document.body) : calendarNode}
    </div>
  )
}
