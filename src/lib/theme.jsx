import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = (e) => {
    const x = e?.clientX ?? window.innerWidth / 2
    const y = e?.clientY ?? window.innerHeight / 2
    document.documentElement.style.setProperty('--theme-x', x + 'px')
    document.documentElement.style.setProperty('--theme-y', y + 'px')
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
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
