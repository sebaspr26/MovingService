import { supabase } from './supabase'

// The AI call (OpenRouter -> Gemini 2.5 Flash) runs in api/scan.js so the
// OpenRouter key never reaches the browser.
const SCAN_URL = '/api/scan'
const REQUEST_TIMEOUT_MS = 60000

// Vercel rejects request bodies over 4.5MB; base64 adds ~33%
const MAX_PDF_BYTES = 3 * 1024 * 1024
// Downscale photos before sending: smaller upload and fewer image tokens
const MAX_IMAGE_SIDE = 1600

// Global lock — prevents duplicate calls from StrictMode or double clicks
let isProcessing = false

export async function analyzeReceipt(imageFile) {
  if (isProcessing) throw new Error('Ya se esta procesando una imagen. Espera un momento.')

  isProcessing = true
  try {
    const { base64, mimeType } = await prepareFile(imageFile)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sesion no valida. Vuelve a iniciar sesion.')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response
    try {
      response = await fetch(SCAN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ base64, mimeType, fileName: imageFile.name }),
        signal: controller.signal,
      })
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('El escaneo tardo demasiado. Intenta de nuevo.')
      throw err
    } finally {
      clearTimeout(timer)
    }

    const result = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 413) throw new Error('El archivo es muy pesado. Usa una imagen o PDF mas liviano.')
      throw new Error(result?.error || `Error del servidor (${response.status}). Intenta de nuevo.`)
    }
    if (!result) throw new Error('No se pudo extraer datos de la imagen. Intenta con una foto mas clara.')

    return normalizeScannedDates(result)
  } finally {
    isProcessing = false
  }
}

export function isScannerBusy() {
  return isProcessing
}

function forceCurrentYear(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return dateStr
  const currentYear = new Date().getFullYear()
  return `${currentYear}-${match[2]}-${match[3]}`
}

function normalizeScannedDates(result) {
  if (!result || typeof result !== 'object') return result

  // Top-level receipt date (multi-item format)
  if (result.date) result.date = forceCurrentYear(result.date)

  // Legacy single-item data + orders
  if (result.data) {
    if (result.data.date) result.data.date = forceCurrentYear(result.data.date)
    if (result.data.pu_date) result.data.pu_date = forceCurrentYear(result.data.pu_date)
    if (result.data.do_date) result.data.do_date = forceCurrentYear(result.data.do_date)
    if (Array.isArray(result.data.stops)) {
      result.data.stops = result.data.stops.map(s => ({
        ...s,
        date: forceCurrentYear(s.date),
      }))
    }
  }

  return result
}

async function prepareFile(file) {
  const mimeType = file.type || 'image/jpeg'
  if (mimeType === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('El PDF es muy pesado (max 3MB). Usa una version mas liviana o una foto.')
    return { base64: await fileToBase64(file), mimeType }
  }
  try {
    return await downscaleImage(file)
  } catch {
    // Formats the browser can't draw (e.g. HEIC on some browsers) go as-is
    return { base64: await fileToBase64(file), mimeType }
  }
}

async function downscaleImage(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(new Error('Error leyendo la imagen'))
    reader.readAsDataURL(file)
  })
}
