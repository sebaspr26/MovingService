import { useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { HELP } from '../lib/help'

// Help (i) that explains what an action does. The text lives in lib/help.js (one place to
// edit them all); use it as <InfoTip id="orders.new" />. Hover on a computer, tap on a phone.
// Rendered in a portal with fixed position so no modal / table / scroll area can clip it.
// Settings > Ayudas can switch all of them off (kept in this browser).

const KEY = 'help-tips'
const listeners = new Set()
const read = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }
export function setHelpTipsEnabled(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ }
  listeners.forEach(l => l())
}
export function useHelpTipsEnabled() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, read, () => true)
}

const W = 288

// Only one tip open at a time: opening one closes the previous
let closeActive = null

/** Mac-style key cap, for shortcuts inside a help text: { key: 'U' } */
export function Key({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-md bg-gray-700 border border-gray-600 border-b-2 text-[11px] font-semibold text-gray-100 leading-none">{children}</kbd>
  )
}

export default function InfoTip({ id, title, text, steps, className = '', side = 'bottom', size = 16 }) {
  const enabled = useHelpTipsEnabled()
  const help = id ? HELP[id] : null
  const t = title ?? help?.title
  const body = text ?? help?.text
  const list = steps ?? help?.steps
  const tip = help?.tip
  const bullets = help?.bullets
  const btn = useRef(null)
  const card = useRef(null)
  const timer = useRef(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)

  function show() {
    clearTimeout(timer.current)
    if (closeActive && closeActive !== close) closeActive()
    closeActive = close
    setOpen(true)
  }
  function close() { clearTimeout(timer.current); setOpen(false) }
  function hide() { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120) }

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const h = card.current?.offsetHeight || 140
    const margin = 10
    let left = r.left + r.width / 2 - W / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - W - margin))
    const below = r.bottom + 8
    const above = r.top - 8 - h
    const wantTop = side === 'top'
    let top = wantTop ? above : below
    if (top + h > window.innerHeight - margin) top = above
    if (top < margin) top = Math.max(margin, Math.min(below, window.innerHeight - h - margin))
    setPos({ left, top })
  }, [open, side])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    const onDown = e => { if (!btn.current?.contains(e.target) && !card.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  useEffect(() => () => { clearTimeout(timer.current); if (closeActive === close) closeActive = null }, [])

  if (!enabled || (!t && !body && !list)) return null

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={t ? `Ayuda: ${t}` : 'Ayuda'}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v) }}
        className={`shrink-0 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-orange-400 focus:outline-none focus-visible:text-orange-400 transition-colors align-middle ${className}`}
        style={{ width: size + 4, height: size + 4 }}
      >
        <svg style={{ width: size, height: size }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={card}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
          className="fixed z-[10000] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 text-left animate-modal-panel"
          style={{ width: W, left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden', maxWidth: 'calc(100vw - 20px)' }}
        >
          {t && <p className="text-sm font-semibold text-white mb-1">{t}</p>}
          {body && <p className="text-xs text-gray-300 leading-relaxed">{body}</p>}
          {list?.length > 0 && (
            <ol className="mt-2.5 space-y-1.5">
              {list.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300 leading-snug">
                  {bullets
                    ? <span className="shrink-0 w-1.5 h-1.5 mt-1.5 rounded-full bg-orange-500/70" />
                    : <span className="shrink-0 w-4 h-4 mt-px rounded-full bg-orange-600/20 text-orange-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>}
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
          {tip && <p className="text-[11px] text-gray-500 mt-3 leading-snug border-t border-gray-800 pt-2.5">{tip}</p>}
        </div>,
        document.body
      )}
    </>
  )
}
