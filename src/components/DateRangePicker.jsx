import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function fmt(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

export default function DateRangePicker({ dateFrom, dateTo, onChange, placeholder = 'Rango de fechas' }) {
  const today = new Date()
  const todayStr = fmt(today)

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [hoverDate, setHoverDate] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const ref = useRef()
  const triggerRef = useRef()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!open) { setHoverDate(null); return }
    if (dateFrom) {
      const d = new Date(dateFrom + 'T00:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  function selectDay(day) {
    const dateStr = fmt(new Date(viewYear, viewMonth, day))

    if (!dateFrom || (dateFrom && dateTo)) {
      // Empezar de nuevo: solo inicio
      onChange({ from: dateStr, to: '' })
    } else {
      // Ya hay inicio, elegir fin
      if (dateStr === dateFrom) {
        // Mismo día = día único
        onChange({ from: dateStr, to: dateStr })
        setOpen(false)
      } else if (dateStr < dateFrom) {
        // Antes del inicio: intercambiar
        onChange({ from: dateStr, to: dateFrom })
        setOpen(false)
      } else {
        // Después del inicio: rango
        onChange({ from: dateFrom, to: dateStr })
        setOpen(false)
      }
    }
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  // Rango efectivo incluyendo preview hover
  const picking = !!(dateFrom && !dateTo)
  const previewTo = picking && hoverDate && hoverDate > dateFrom ? hoverDate : null
  const previewFrom = picking && hoverDate && hoverDate < dateFrom ? hoverDate : null
  const effFrom = previewFrom || dateFrom || ''
  const effTo = previewTo || dateTo || ''
  const isPreview = !!(previewTo || previewFrom)

  // Etiqueta del botón
  let label = null
  if (dateFrom && dateTo) {
    label = dateFrom === dateTo
      ? fmtShort(dateFrom) + ' ' + new Date(dateFrom + 'T00:00:00').getFullYear()
      : `${fmtShort(dateFrom)} – ${fmtShort(dateTo)} ${new Date(dateTo + 'T00:00:00').getFullYear()}`
  } else if (dateFrom) {
    label = `${fmtShort(dateFrom)} → ...`
  }

  const hasValue = !!(dateFrom || dateTo)

  const calendarNode = open && (
    <>
      {isMobile && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />}
      <div
        ref={isMobile ? null : ref}
        className={`z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3 ${
          isMobile
            ? 'fixed left-4 right-4 top-1/2 -translate-y-1/2'
            : 'absolute top-full mt-1 left-0 w-[280px]'
        }`}
      >
        {/* Hint */}
        <p className="text-center text-[10px] text-gray-500 mb-2">
          {picking
            ? 'Elige la fecha fin · mismo día = solo ese día'
            : 'Elige la fecha de inicio'}
        </p>

        {/* Header mes */}
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={prevMonth} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-white">{MONTHS[viewMonth]} {viewYear}</span>
          <button type="button" onClick={nextMonth} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors">
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

        {/* Grilla días */}
        <div className="grid grid-cols-7" onMouseLeave={() => setHoverDate(null)}>
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = fmt(new Date(viewYear, viewMonth, day))
            const isFrom = dateStr === effFrom
            const isTo = dateStr === effTo
            const isSelected = isFrom || isTo
            const isToday = dateStr === todayStr
            const inRange = effFrom && effTo && dateStr > effFrom && dateStr < effTo
            const rangeBg = isPreview ? 'bg-orange-500/10' : 'bg-orange-500/15'

            return (
              <div key={day} className="relative h-8 flex items-center justify-center">
                {inRange && <div className={`absolute inset-0 ${rangeBg}`} />}
                {isFrom && effTo && effFrom !== effTo && (
                  <div className={`absolute top-0 bottom-0 left-1/2 right-0 ${rangeBg}`} />
                )}
                {isTo && effFrom && effFrom !== effTo && (
                  <div className={`absolute top-0 bottom-0 right-1/2 left-0 ${rangeBg}`} />
                )}
                <button
                  type="button"
                  onClick={() => selectDay(day)}
                  onMouseEnter={() => setHoverDate(dateStr)}
                  className={`relative z-10 w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                    isSelected
                      ? `bg-orange-600 text-white${isPreview ? ' opacity-60' : ''}`
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
            onClick={() => { onChange({ from: fmt(today), to: fmt(today) }); setOpen(false) }}
            className="text-[10px] text-blue-400 hover:text-orange-300 transition-colors"
          >
            Hoy
          </button>
          {hasValue && (
            <button
              type="button"
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
        ref={triggerRef}
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

      {isMobile
        ? createPortal(calendarNode, document.body)
        : calendarNode}
    </div>
  )
}
