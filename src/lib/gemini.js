const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'google/gemini-2.5-flash'

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

If it's a DEF (Diesel Exhaust Fluid) receipt:
{
  "type": "def",
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
    "category": "one of: Mantenimiento|Seguro|Peajes|Reparacion|Llantas|Lavado|Parqueo|Multas|Comida|Otros",
    "invoice_number": "string",
    "description": "brief description",
    "amount": number,
    "date": "YYYY-MM-DD"
  }
}

Rules:
- Use 0 for numbers you can't read
- Use "" for text you can't read
- Source documents use US date format: mm/dd/yyyy (MONTH first, then DAY, then YEAR). Example: "6/1/2026" means June 1st → output "2026-06-01", NOT "2026-01-06"
- Output dates must be YYYY-MM-DD format
- For amounts, extract the total amount paid
- If it's clearly a fuel/diesel receipt, type is "diesel"
- If it's a DEF (Diesel Exhaust Fluid) receipt, type is "def"
- If it's a load confirmation or bill of lading, type is "order"
- Otherwise, type is "expense"
- Return ONLY valid JSON, no markdown, no explanation`

// Global lock — prevents duplicate calls from StrictMode or double clicks
let isProcessing = false

async function callOpenRouter(messages) {
  const body = {
    model: MODEL,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.1,
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': window.location.origin,
    },
    body: JSON.stringify(body),
  })

  if (response.ok) return response

  // Silent retry only for 503 (momentary blip)
  if (response.status === 503) {
    await new Promise(r => setTimeout(r, 1000))
    const retry = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': window.location.origin,
      },
      body: JSON.stringify(body),
    })
    if (retry.ok) return retry
    throw new Error('Servicio no disponible. Intenta de nuevo en unos momentos.')
  }

  if (response.status === 429) throw new Error('Limite de requests alcanzado. Intenta de nuevo en unos segundos.')
  if (response.status === 400) throw new Error('Imagen no valida o formato no soportado.')
  throw new Error(`Error del servidor (${response.status}). Intenta de nuevo.`)
}

export async function analyzeReceipt(imageFile) {
  if (!OPENROUTER_KEY) throw new Error('API key de OpenRouter no configurada')
  if (isProcessing) throw new Error('Ya se esta procesando una imagen. Espera un momento.')

  isProcessing = true
  try {
    const base64 = await fileToBase64(imageFile)
    const mimeType = imageFile.type || 'image/jpeg'

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ]

    const response = await callOpenRouter(messages)
    const result = await response.json()
    const text = result.choices?.[0]?.message?.content

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