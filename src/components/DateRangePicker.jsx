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
  const [dragging, setDragging] = useState(false)
  const [dragRange, setDragRange] = useState({ start: null, current: null })

  // Refs for access inside event handlers without stale closures
  const dragRef = useRef({ active: false, start: null, current: null })
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const ref = useRef()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!open) { resetDrag(); return }
    if (dateFrom) {
      const d = new Date(dateFrom + 'T00:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
    function outside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  // Global mouseup — confirm drag range
  useEffect(() => {
    function onMouseUp() {
      if (!dragRef.current.active) return
      confirmDrag()
    }
    function onTouchEnd() {
      if (!dragRef.current.active) return
      confirmDrag()
    }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  function confirmDrag() {
    const { start, current } = dragRef.current
    if (start) {
      const cur = current || start
      const from = start <= cur ? start : cur
      const to   = start >= cur ? start : cur
      onChangeRef.current({ from, to })
      setOpen(false)
    }
    resetDrag()
  }

  function resetDrag() {
    dragRef.current = { active: false, start: null, current: null }
    setDragging(false)
    setDragRange({ start: null, current: null })
  }

  function startDrag(dateStr) {
    dragRef.current = { active: true, start: dateStr, current: dateStr }
    setDragging(true)
    setDragRange({ start: dateStr, current: dateStr })
  }

  function moveDrag(dateStr) {
    if (!dragRef.current.active) return
    dragRef.current.current = dateStr
    setDragRange(r => ({ ...r, current: dateStr }))
  }

  function prevMonth() { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1)}else setViewMonth(m=>m-1) }
  function nextMonth() { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1)}else setViewMonth(m=>m+1) }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  // Compute effective range for highlighting
  const effFrom = dragging && dragRange.start
    ? [dragRange.start, dragRange.current || dragRange.start].sort()[0]
    : dateFrom || ''
  const effTo = dragging && dragRange.start
    ? [dragRange.start, dragRange.current || dragRange.start].sort()[1]
    : dateTo || ''

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

  // Touch move: find which day cell is under finger
  function handleTouchMove(e) {
    if (!dragRef.current.active) return
    e.preventDefault()
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const dateStr = el?.closest('[data-date]')?.dataset?.date
    if (dateStr) moveDrag(dateStr)
  }

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
        <p className="text-center text-[10px] mb-2 transition-colors" style={{ color: dragging ? '#f97316' : '#6b7280' }}>
          {dragging ? 'Suelta para confirmar' : 'Presiona y arrastra para seleccionar un rango'}
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
        <div
          className="grid grid-cols-7"
          onTouchMove={handleTouchMove}
        >
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = fmt(new Date(viewYear, viewMonth, day))
            const isFrom = dateStr === effFrom
            const isTo   = dateStr === effTo
            const isEndpoint = isFrom || isTo
            const isToday = dateStr === todayStr
            const inRange = effFrom && effTo && dateStr > effFrom && dateStr < effTo
            const rangeBg = dragging ? 'bg-orange-500/20' : 'bg-orange-500/15'

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
                  data-date={dateStr}
                  onMouseDown={e => { e.preventDefault(); startDrag(dateStr) }}
                  onMouseEnter={() => moveDrag(dateStr)}
                  onTouchStart={e => { e.preventDefault(); startDrag(dateStr) }}
                  className={`relative z-10 w-8 h-8 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    isEndpoint
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
            onClick={() => { onChange({ from: fmt(today), to: fmt(today) }); setOpen(false) }}
            className="text-[10px] text-blue-400 hover:text-orange-300 transition-colors"
          >
            Hoy
          </button>
          {hasValue && (
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
