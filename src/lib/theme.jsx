import { createContext, useContext, useState, useEffect } from 'react'
import { THEMES, DEFAULT_THEME, isLightTheme, themeInfo } from './themes'

const ThemeContext = createContext()

const stored = () => {
  const id = localStorage.getItem('theme')
  return THEMES.some(t => t.id === id) ? id : DEFAULT_THEME
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(stored)
  const isLight = isLightTheme(theme)

  // `light` class = any light look (shared overrides); data-theme = which one
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('light', isLight)
    root.dataset.theme = theme
    localStorage.setItem('theme', theme)
    // Browser / phone status bar color
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeInfo(theme).preview.bg)
  }, [theme, isLight])

  // Changing the look reveals the new one as a circle growing from the click
  const setTheme = (id, e) => {
    if (id === theme) return
    const x = e?.clientX ?? window.innerWidth / 2
    const y = e?.clientY ?? window.innerHeight / 2
    document.documentElement.style.setProperty('--theme-x', x + 'px')
    document.documentElement.style.setProperty('--theme-y', y + 'px')
    if (!document.startViewTransition) { setThemeState(id); return }
    document.startViewTransition(() => setThemeState(id))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isLight, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
