import { createContext, useContext, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const ThemeContext = createContext()

function WaterDropRipple({ x, y }) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999, overflow: 'hidden' }}>
      {/* Flash central — impacto de la gota */}
      <span style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-50%, -50%)',
        display: 'block',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.3) 40%, transparent 70%)',
        animation: 'drop-flash 0.45s cubic-bezier(0.22,1,0.36,1) forwards',
      }} />
      {/* Anillos de onda */}
      {[0, 1, 2, 3].map(i => (
        <span key={i} style={{
          position: 'absolute',
          left: x, top: y,
          transform: 'translate(-50%, -50%)',
          display: 'block',
          borderRadius: '50%',
          border: `${Math.max(0.5, 1.8 - i * 0.35)}px solid rgba(255,255,255,${0.55 - i * 0.1})`,
          animation: `drop-ring 1s ${i * 110}ms cubic-bezier(0.2,0.65,0.35,1) forwards`,
        }} />
      ))}
    </div>,
    document.body
  )
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [ripple, setRipple] = useState(null)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = (e) => {
    const x = e?.clientX ?? window.innerWidth / 2
    const y = e?.clientY ?? window.innerHeight / 2
    document.documentElement.style.setProperty('--theme-x', x + 'px')
    document.documentElement.style.setProperty('--theme-y', y + 'px')

    const id = Date.now()
    setRipple({ x, y, id })
    setTimeout(() => setRipple(r => r?.id === id ? null : r), 1300)

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
      {ripple && <WaterDropRipple key={ripple.id} x={ripple.x} y={ripple.y} />}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
