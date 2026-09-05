import { useState, useEffect } from 'react'
import Login from './Login'

const TARGET_KEY = 'etg_launch_target'

function getTarget() {
  const stored = localStorage.getItem(TARGET_KEY)
  if (stored) {
    const t = parseInt(stored, 10)
    if (t > Date.now()) return t
  }
  const target = Date.now() + 24 * 60 * 60 * 1000
  localStorage.setItem(TARGET_KEY, String(target))
  return target
}

function getTimeLeft(target) {
  const diff = Math.max(0, target - Date.now())
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return { h, m, s, done: diff === 0 }
}

export default function ComingSoon() {
  const [showLogin, setShowLogin] = useState(false)
  const [target] = useState(getTarget)
  const [time, setTime] = useState(() => getTimeLeft(target))

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'x' || e.key === 'X') setShowLogin(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (showLogin) return <Login />

  const pad = n => String(n).padStart(2, '0')

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-600/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-orange-600/8 rounded-full blur-2xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-xl w-full">

        {/* Logo / icon */}
        <div className="mb-8 w-16 h-16 rounded-2xl bg-orange-600/15 border border-orange-600/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
        </div>

        <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase mb-3">ETG Moving Services</p>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
          Pr&oacute;ximamente
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-12 max-w-sm">
          Estamos preparando algo incre&iacute;ble. El sistema estar&aacute; disponible muy pronto.
        </p>

        {/* Countdown */}
        <div className="flex items-start gap-4 sm:gap-6">
          <CountUnit value={pad(time.h)} label="Horas" />
          <Separator />
          <CountUnit value={pad(time.m)} label="Minutos" />
          <Separator />
          <CountUnit value={pad(time.s)} label="Segundos" />
        </div>

        {/* Progress bar */}
        <div className="mt-10 w-full max-w-xs">
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full transition-all duration-1000"
              style={{ width: `${100 - ((time.h * 3600 + time.m * 60 + time.s) / 86400) * 100}%` }}
            />
          </div>
        </div>

        <p className="mt-10 text-xs text-gray-700 select-none">
          ETG TMS &mdash; Sistema de Gesti&oacute;n de Transporte
        </p>
      </div>
    </div>
  )
}

function CountUnit({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-20 sm:w-24 h-20 sm:h-24 bg-gray-900 border border-gray-800 rounded-2xl flex items-center justify-center shadow-xl">
        <span className="text-3xl sm:text-4xl font-bold text-white tabular-nums tracking-tight">
          {value}
        </span>
      </div>
      <span className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">{label}</span>
    </div>
  )
}

function Separator() {
  return (
    <div className="flex flex-col gap-3 pt-5">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
    </div>
  )
}
