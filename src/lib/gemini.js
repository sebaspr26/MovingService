const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`

const PROMPT = `Analyze this receipt/invoice image and extract the data.
Determine the type of document and return ONE of these formats:

If it's a LOAD/ORDER (bill of lading, rate confirmation, load sheet):
{
  "type": "order",
  "data": {
    "order_number": "string",
    "pu_date": "YYYY-MM-DD",
    "pu_city": "string",
    "do_date": "YYYY-MM-DD",
    "do_city": "string",
    "miles": number,
    "rate": number
  }
}

If it's a DIESEL/FUEL receipt:
{
  "type": "diesel",
  "data": {
    "invoice_number": "string",
    "date": "YYYY-MM-DD",
    "city": "string",
    "gallons": number,
    "value": number
  }
}

If it's a GENERAL EXPENSE (maintenance, tolls, repairs, tires, etc):
{
  "type": "expense",
  "data": {
    "category": "one of: Mantenimiento|Seguro|Peajes|Reparacion|Llantas|Lavado|Parqueo|Multas|Comida|DEF|Otros",
    "invoice_number": "string",
    "description": "brief description",
    "amount": number,
    "date": "YYYY-MM-DD"
  }
}

Rules:
- Use 0 for numbers you can't read
- Use "" for text you can't read
- Dates must be YYYY-MM-DD format
- For amounts, extract the total amount paid
- If it's clearly a fuel/diesel receipt, type is "diesel"
- If it's a load confirmation or bill of lading, type is "order"
- Otherwise, type is "expense"`

// Global lock — prevents duplicate calls from StrictMode or double clicks
let isProcessing = false

async function callGemini(body) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (response.ok) return response

  // Silent retry only for 503 (Google momentary blip)
  if (response.status === 503) {
    await new Promise(r => setTimeout(r, 1000))
    const retry = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (retry.ok) return retry
    throw new Error('Servicio no disponible. Intenta de nuevo en unos momentos.')
  }

  if (response.status === 429) throw new Error('Limite de requests alcanzado. Intenta de nuevo en unos segundos.')
  if (response.status === 400) throw new Error('Imagen no valida o formato no soportado.')
  throw new Error(`Error del servidor (${response.status}). Intenta de nuevo.`)
}

export async function analyzeReceipt(imageFile) {
  if (!GEMINI_KEY) throw new Error('API key de Gemini no configurada')
  if (isProcessing) throw new Error('Ya se esta procesando una imagen. Espera un momento.')

  isProcessing = true
  try {
    const base64 = await fileToBase64(imageFile)
    const mimeType = imageFile.type || 'image/jpeg'

    const body = {
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      }
    }

    const response = await callGemini(body)
    const result = await response.json()
    const parts = result.candidates?.[0]?.content?.parts || []
    // Gemini 2.5 Flash is a thinking model — skip thought parts, get the actual response
    const outputPart = parts.filter(p => !p.thought).pop()
    const text = outputPart?.text
    if (!text) throw new Error('No se pudo extraer datos de la imagen. Intenta con una foto mas clara.')

    return JSON.parse(text)
  } finally {
    isProcessing = false
  }
}

export function isScannerBusy() {
  return isProcessing
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(new Error('Error leyendo la imagen'))
    reader.readAsDataURL(file)
  })
}
