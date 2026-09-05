import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function MultiSelect({ options, value = [], onChange, placeholder = 'Todos' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    // Calculate position from trigger
    const rect = ref.current?.getBoundingClientRect()
    if (rect) {
      setPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle(val) {
    if (value.includes(val)) onChange(value.filter(v => v !== val))
    else onChange([...value, val])
  }

  function selectAll() { onChange(options.map(o => o.value)) }
  function clearAll() { onChange([]) }

  // Label shown in trigger
  let label
  if (value.length === 0) label = null
  else if (value.length === 1) label = options.find(o => o.value === value[0])?.label || value[0]
  else label = `${value.length} seleccionados`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500 transition-colors ${label ? 'text-gray-100' : 'text-gray-500'}`}
      >
        <span className="truncate">{label || placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value.length > 0 && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); clearAll() }}
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

      {open && createPortal(
        <div
          style={{ position: 'absolute', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-max max-w-[240px]"
        >
          {/* Actions */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <button type="button" onClick={selectAll} className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors">Todos</button>
            <button type="button" onClick={clearAll} className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors">Limpiar</button>
          </div>
          {/* Options */}
          <div className="max-h-52 overflow-y-auto py-1">
            {options.map(opt => {
              const checked = value.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left hover:bg-gray-800 transition-colors"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-orange-500 border-orange-500' : 'border-gray-600 bg-transparent'}`}>
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                  <span className={checked ? 'text-gray-100' : 'text-gray-400'}>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
