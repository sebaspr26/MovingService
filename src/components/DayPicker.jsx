import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function DayPicker({ value, onChange, placeholder = 'Dia...' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const ref = useRef()
  const dropRef = useRef()

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && dropRef.current && !dropRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const dropH = 220
      const spaceBelow = window.innerHeight - rect.bottom
      const above = spaceBelow < dropH && rect.top > dropH
      setPos({
        left: rect.left,
        width: 240,
        ...(above
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 })
      })
    }
    setOpen(!open)
  }

  function selectDay(day) {
    onChange(day)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-left focus:outline-none focus:border-orange-500 flex items-center justify-between gap-2 transition-colors ${
          value ? 'text-gray-100' : 'text-gray-500'
        }`}
      >
        <span>{value ? `Dia ${value}` : placeholder}</span>
        <svg className={`w-3 h-3 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3"
          style={{ left: pos.left, width: pos.width, ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }) }}
        >
          <p className="text-[10px] text-gray-500 font-medium uppercase mb-2 text-center">Dia del mes</p>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }).map((_, i) => {
              const day = i + 1
              const isSelected = day === value
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-orange-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
          {value && (
            <div className="mt-2 pt-2 border-t border-gray-800 text-center">
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false) }}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
