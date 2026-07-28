import { useState, useRef, useEffect } from 'react'

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

function displayDate(val) {
  if (!val) return null
  const d = new Date(val + 'T00:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

export default function DateRangePicker({ startDate, endDate, onChange, placeholder = 'Seleccionar rango...' }) {
  const today = new Date()
  const parsedStart = startDate ? new Date(startDate + 'T00:00:00') : null
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(parsedStart?.getFullYear() || today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsedStart?.getMonth() ?? today.getMonth())
  const [hovered, setHovered] = useState(null)
  // 0 = waiting for start, 1 = start picked waiting for end
  const [pickStep, setPickStep] = useState(startDate && !endDate ? 1 : 0)
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (open) {
      const p = parsedStart || today
      setViewYear(p.getFullYear())
      setViewMonth(p.getMonth())
      setPickStep(startDate && !endDate ? 1 : 0)
    }
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

    if (pickStep === 0) {
      // First click: set start
      onChange(dateStr, '')
      setPickStep(1)
    } else {
      // Second click: set end (swap if needed)
      if (dateStr < startDate) {
        onChange(dateStr, startDate)
      } else {
        onChange(startDate, dateStr)
      }
      setPickStep(0)
      setOpen(false)
    }
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const todayStr = fmt(today)

  function getDayClass(day) {
    const dateStr = fmt(new Date(viewYear, viewMonth, day))
    const isStart = dateStr === startDate
    const isEnd = dateStr === endDate
    const isToday = dateStr === todayStr

    // Determine if in range
    let inRange = false
    if (startDate && endDate) {
      inRange = dateStr > startDate && dateStr < endDate
    } else if (startDate && pickStep === 1 && hovered) {
      const rangeEnd = hovered >= startDate ? hovered : startDate
      const rangeStart = hovered < startDate ? hovered : startDate
      inRange = dateStr > rangeStart && dateStr < rangeEnd
    }

    if (isStart || isEnd) {
      return 'bg-blue-600 text-white'
    }
    if (inRange) {
      return 'bg-blue-600/20 text-blue-300'
    }
    if (isToday) {
      return 'bg-gray-800 text-blue-400 ring-1 ring-blue-500/50'
    }
    return 'text-gray-300 hover:bg-gray-800 hover:text-white'
  }

  function getDayShape(day) {
    const dateStr = fmt(new Date(viewYear, viewMonth, day))
    const isStart = dateStr === startDate
    const isEnd = dateStr === endDate

    let effectiveEnd = endDate
    if (!endDate && pickStep === 1 && hovered) {
      effectiveEnd = hovered >= startDate ? hovered : null
    }
    let effectiveStart = startDate
    if (!endDate && pickStep === 1 && hovered && hovered < startDate) {
      effectiveStart = hovered
      effectiveEnd = startDate
    }

    const inRange = effectiveStart && effectiveEnd && dateStr >= effectiveStart && dateStr <= effectiveEnd

    if (!inRange) return 'rounded-lg'
    if (dateStr === effectiveStart && dateStr === effectiveEnd) return 'rounded-lg'
    if (dateStr === effectiveStart) return 'rounded-l-lg rounded-r-none'
    if (dateStr === effectiveEnd) return 'rounded-r-lg rounded-l-none'
    return 'rounded-none'
  }

  const displayValue = startDate
    ? endDate
      ? `${displayDate(startDate)} - ${displayDate(endDate)}`
      : displayDate(startDate) + ' - ...'
    : null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-left focus:outline-none focus:border-blue-500 flex items-center justify-between gap-2 transition-colors ${
          startDate ? 'text-gray-100' : 'text-gray-500'
        }`}
      >
        <span className="truncate">{displayValue || placeholder}</span>
        <svg className={`w-3 h-3 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3 w-[280px] animate-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-white">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Step hint */}
          <p className="text-[10px] text-center text-gray-500 mb-2">
            {pickStep === 0 ? 'Selecciona fecha de inicio' : 'Selecciona fecha de fin'}
          </p>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] text-gray-500 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = fmt(new Date(viewYear, viewMonth, day))
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  onMouseEnter={() => pickStep === 1 && setHovered(dateStr)}
                  onMouseLeave={() => setHovered(null)}
                  className={`w-8 h-8 mx-auto text-xs font-medium transition-colors ${getDayClass(day)} ${getDayShape(day)}`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800">
            <button
              type="button"
              onClick={() => {
                const t = fmt(today)
                onChange(t, t)
                setPickStep(0)
                setOpen(false)
              }}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              Hoy
            </button>
            {startDate && (
              <button
                type="button"
                onClick={() => { onChange('', ''); setPickStep(0); setOpen(false) }}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
