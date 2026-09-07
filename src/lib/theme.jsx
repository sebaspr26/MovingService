import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const ThemeContext = createContext()

const DURATION = 2600  // ms — velocidad total
const BAND_PX  = 38    // ~1cm entre los dos anillos

function easeOut(t) {
  return 1 - Math.pow(1 - t, 2.2)
}

function WaterDrop({ x, y }) {
  const [outerR, setOuterR] = useState(0)
  const startRef = useRef(null)
  const rafRef   = useRef(null)

  const W    = window.innerWidth
  const H    = window.innerHeight
  const maxR = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + BAND_PX + 30

  useEffect(() => {
    function tick(now) {
      if (!startRef.current) startRef.current = now
      const t = Math.min((now - startRef.current) / DURATION, 1)
      setOuterR(maxR * easeOut(t))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [maxR])

  const innerR = Math.max(0, outerR - BAND_PX)

  // Lente: backdrop-filter visible solo en la banda (donut) usando mask en px
  const lensStyle = {
    position: 'fixed',
    left: x - outerR,
    top:  y - outerR,
    width:  outerR * 2,
    height: outerR * 2,
    backdropFilter:         'blur(5px) brightness(1.35) saturate(0.45)',
    WebkitBackdropFilter:   'blur(5px) brightness(1.35) saturate(0.45)',
    maskImage:        `radial-gradient(circle at center,
      transparent     ${Math.max(0, innerR - 1)}px,
      black           ${innerR + 2}px,
      black           ${outerR - 2}px,
      transparent     ${outerR + 1}px)`,
    WebkitMaskImage:  `radial-gradient(circle at center,
      transparent     ${Math.max(0, innerR - 1)}px,
      black           ${innerR + 2}px,
      black           ${outerR - 2}px,
      transparent     ${outerR + 1}px)`,
    pointerEvents: 'none',
    zIndex: 99999,
  }

  // Anillo exterior — borde de cristal
  const ringOutStyle = {
    position: 'fixed',
    left:   x - outerR,
    top:    y - outerR,
    width:  outerR * 2,
    height: outerR * 2,
    borderRadius: '50%',
    border: '1.5px solid rgba(255,255,255,0.38)',
    boxShadow: '0 0 12px rgba(255,255,255,0.12), inset 0 0 8px rgba(255,255,255,0.06)',
    pointerEvents: 'none',
    zIndex: 100000,
  }

  // Anillo interior — solo visible cuando ya se separó del exterior
  const ringInStyle = innerR > 4 ? {
    position: 'fixed',
    left:   x - innerR,
    top:    y - innerR,
    width:  innerR * 2,
    height: innerR * 2,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.22)',
    pointerEvents: 'none',
    zIndex: 100000,
  } : null

  if (outerR <= 0) return null

  return createPortal(
    <>
      <div style={lensStyle} />
      <div style={ringOutStyle} />
      {ringInStyle && <div style={ringInStyle} />}
    </>,
    document.body
  )
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [drop,  setDrop]  = useState(null)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = (e) => {
    const x = e?.clientX ?? window.innerWidth  / 2
    const y = e?.clientY ?? window.innerHeight / 2
    document.documentElement.style.setProperty('--theme-x', x + 'px')
    document.documentElement.style.setProperty('--theme-y', y + 'px')

    const id = Date.now()
    setDrop({ x, y, id })
    setTimeout(() => setDrop(d => d?.id === id ? null : d), DURATION + 400)

    if (!document.startViewTransition) {
      setTheme(prev => prev === 'dark' ? 'light' : 'dark')
      return
    }
    document.startViewTransition(() => {
      setTheme(prev => prev === 'dark' ? 'light' : 'dark')
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
      {drop && <WaterDrop key={drop.id} x={drop.x} y={drop.y} />}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
