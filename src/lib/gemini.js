const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-2.0-flash-lite'
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

// Throttle: track last call time to enforce 5s minimum gap
let lastCallTime = 0

async function waitForThrottle() {
  const now = Date.now()
  const elapsed = now - lastCallTime
  const minGap = 5000
  if (elapsed < minGap) {
    await new Promise(r => setTimeout(r, minGap - elapsed))
  }
  lastCallTime = Date.now()
}

async function callGeminiWithRetry(base64, mimeType, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await waitForThrottle()

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      })
    })

    if (response.ok) {
      return response
    }

    if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
      const backoff = Math.pow(2, attempt + 1) * 2000 // 4s, 8s, 16s
      console.warn(`Gemini ${response.status}, reintentando en ${backoff / 1000}s... (intento ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, backoff))
      lastCallTime = Date.now()
      continue
    }

    const err = await response.text()
    throw new Error(`Error Gemini (${response.status}): ${err}`)
  }
}

export async function analyzeReceipt(imageFile) {
  if (!GEMINI_KEY) throw new Error('API key de Gemini no configurada')

  const base64 = await fileToBase64(imageFile)
  const mimeType = imageFile.type || 'image/jpeg'

  const response = await callGeminiWithRetry(base64, mimeType)
  const result = await response.json()

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No se pudo analizar la imagen')

  return JSON.parse(text)
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
