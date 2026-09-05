import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/Toast'
import { ThemeProvider } from './lib/theme'
import { AuthProvider } from './context/AuthContext'
import { CompanyProvider } from './context/CompanyContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <CompanyProvider>
            <App />
          </CompanyProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
