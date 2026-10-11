// The six looks of the app: 3 dark and 3 light. Each one is a CSS override of the gray
// palette in index.css (html[data-theme="..."]), so every screen follows it. `preview`
// is only for the little cards in Configuración. 'dark' and 'light' keep their old ids so
// the choice people already saved still works.
export const THEMES = [
  { id: 'dark', label: 'Medianoche', hint: 'Azul grisáceo (el de siempre)', mode: 'dark',
    preview: { bg: '#030712', card: '#111827', line: '#374151', soft: '#1f2937' } },
  { id: 'graphite', label: 'Grafito', hint: 'Negro neutro, sin tinte', mode: 'dark',
    preview: { bg: '#09090b', card: '#18181b', line: '#3f3f46', soft: '#27272a' } },
  { id: 'ocean', label: 'Océano', hint: 'Azul marino profundo', mode: 'dark',
    preview: { bg: '#04111f', card: '#0b2036', line: '#1f4565', soft: '#143049' } },
  { id: 'light', label: 'Claro', hint: 'Blanco y gris (el de siempre)', mode: 'light',
    preview: { bg: '#ffffff', card: '#f3f4f6', line: '#d1d5db', soft: '#e5e7eb' } },
  { id: 'mint', label: 'Verde claro', hint: 'Blanco con un toque de menta', mode: 'light',
    preview: { bg: '#f6fbf7', card: '#e8f4ec', line: '#b9d6c4', soft: '#d5e9dc' } },
  { id: 'rose', label: 'Rojo claro', hint: 'Blanco con un toque de rosa', mode: 'light',
    preview: { bg: '#fdf6f6', card: '#f9e9ea', line: '#e4b8bd', soft: '#f1d5d8' } },
]

export const DEFAULT_THEME = 'dark'
export const themeInfo = id => THEMES.find(t => t.id === id) || THEMES[0]
export const isLightTheme = id => themeInfo(id).mode === 'light'
