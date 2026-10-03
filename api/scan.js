import { createClient } from '@supabase/supabase-js'

// AI scanner proxy — keeps the OpenRouter key on the server.
// The key used to live in VITE_OPENROUTER_KEY, which Vite bundles into the
// public JS, so anyone visiting the site could copy it and spend our credits.
const OPENROUTER_KEY = process.env.OPENROUTER_KEY
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'google/gemini-2.5-flash'

// Gemini 2.5 Flash can fall into a repetition loop in JSON mode and keep
// generating until its ~65k token limit. Cap output and wall time so a bad
// response fails fast instead of hanging and burning credits.
const MAX_OUTPUT_TOKENS = 8000
const REQUEST_TIMEOUT_MS = 55000

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const PROMPT = `Analyze this receipt/invoice image and extract the data.
Determine the type of document and return the appropriate format.

IMPORTANT: A single receipt may contain MULTIPLE items (e.g. diesel AND DEF on one fuel receipt, or multiple repairs on one invoice). Extract ALL items found.

For cities, ALWAYS include the US state abbreviation in format "CITY, ST" (e.g. "MIAMI, FL", "DALLAS, TX", "LUDLOW, VT").

If it's a LOAD/ORDER (bill of lading, rate confirmation, load sheet):
{
  "type": "order",
  "data": {
    "order_number": "string (load # or PRO #)",
    "ref_number": "string (reference, PO, or pickup number if available)",
    "pu_date": "YYYY-MM-DD (first pickup date)",
    "pu_city": "CITY, ST",
    "do_date": "YYYY-MM-DD (last delivery date)",
    "do_city": "CITY, ST",
    "miles": number,
    "rate": number (total rate/linehaul),
    "equipment_type": "string (e.g. Dry Van, Flatbed, Reefer, Step Deck, 26ft Box Truck, etc.)",
    "broker": {
      "name": "string (broker/company name)",
      "contact": "string (contact person name)",
      "phone": "string",
      "email": "string",
      "mc_number": "string (MC number — REQUIRED: read the EXACT MC number printed on THIS document. Look for MC#, MC-XXXXXX, MC:XXXXXX, Motor Carrier number in header, footer, fine print, sidebar, terms section. DO NOT guess or use memorized MC numbers for known brokers — always read the actual number from the document. Return ONLY digits, no prefixes.)",
      "dot_number": "string (DOT number — REQUIRED: scan the ENTIRE document for DOT#, USDOT, DOT-XXXXXX, DOT:XXXXXX. Check header, footer, fine print, sidebar, terms section. Return ONLY digits, no prefixes.)",
      "address": "string"
    },
    "stops": [
      {
        "type": "pickup or delivery",
        "location_name": "string (facility/company name)",
        "address": "string (full street address with city, state, zip)",
        "city": "CITY, ST",
        "state": "ST",
        "date": "YYYY-MM-DD",
        "time": "HH:MM (24h format, start/from time)",
        "time_end": "HH:MM (24h format, end/to time)",
        "schedule_type": "appointment or range (appointment = both times are the same e.g. 5:00 AM - 5:00 AM, range = different times e.g. 6:00 AM - 12:00 PM)",
        "ref_number": "string (stop-level reference/PO if any)",
        "notes": "string"
      }
    ],
    "commodity": "string (what is being shipped)",
    "weight": number (total weight in lbs, 0 if unknown),
    "special_instructions": "string (any special notes)"
  }
}

For ANY other receipt (fuel, DEF, maintenance, tolls, repairs, etc), return this multi-item format:
{
  "invoice_number": "string",
  "date": "YYYY-MM-DD",
  "city": "CITY, ST",
  "items": [
    { "type": "diesel", "gallons": number, "value": number },
    { "type": "def", "gallons": number, "value": number },
    { "type": "expense", "category": "one of: Mantenimiento|Seguro|Peajes|Reparacion|Llantas|Lavado|Parqueo|Multas|Comida|DEF|Otros", "description": "brief description", "amount": number }
  ]
}

Rules:
- Use 0 for numbers you can't read
- Use "" for text you can't read
- Cities MUST include US state abbreviation: "CITY, ST" format
- Source documents use US date format: mm/dd/yyyy (MONTH first, then DAY, then YEAR). Example: "6/1/2026" means June 1st → output "2026-06-01", NOT "2026-01-06"
- Output dates must be YYYY-MM-DD format
- IMPORTANT: Receipts and load confirmations are always from the current operational year. Always use the current year for any date you extract. If the document appears to show a different year, treat it as an OCR error and use the current year instead.
- For amounts, extract the total amount paid per item
- If a fuel receipt has BOTH diesel AND DEF, include BOTH as separate items in the array
- If a receipt has multiple services/repairs, include each as a separate expense item
- For rate confirmations, extract ALL stops in order (pickups first, then deliveries). Include location names and appointment times.
- For stop times: if a stop shows "5:00 AM - 5:00 AM" (same time twice), it's schedule_type "appointment". If it shows "6:00 AM - 12:00 PM" (different times), it's schedule_type "range". Extract both time (start) and time_end (end) in 24h HH:MM format.
- Only use "type": "order" format for load confirmations or bills of lading
- CRITICAL: For rate confirmations, you MUST extract BOTH MC# AND DOT# numbers by READING them directly from the document. NEVER guess, infer, or use memorized numbers — even for well-known brokers like TQL, CH Robinson, Coyote, Echo, or XPO. The number on THIS specific document is the only correct answer. Search EVERY part of the document: header, footer, fine print, sidebar, terms & conditions, signature block. Look for patterns: "MC-123456", "MC# 123456", "MC:123456", "MC 123456", "USDOT 123456", "DOT# 123456", "DOT: 123456", "DOT 123456". Extract the BROKER's MC and DOT numbers (the company issuing the rate confirmation), NOT the carrier's. Return only the numeric digits (e.g. "381344" not "MC#381344"). If you cannot clearly read a number, return "" instead of guessing.
- Return ONLY valid JSON, no markdown, no explanation`

// Receipts-only prompt (expenses screen). The general PROMPT above describes ONE
// receipt, so a photo with two receipts came back merged, with only one of
// them, or empty. This one asks for every receipt in the image separately.
const RECEIPT_PROMPT = `You are reading expense receipts for a trucking company (fuel stations, DEF, repairs, tolls, parking, tires, insurance, food, etc.).

The image may contain ONE OR SEVERAL separate receipts photographed together (side by side, overlapping, stacked, rotated, partially folded). First count how many distinct receipts are visible — each paper ticket or invoice is a separate receipt even if they are from the same store. Then extract EACH receipt separately. Never merge two receipts into one, and never drop one.

Return ONLY valid JSON in this format:
{
  "receipts": [
    {
      "invoice_number": "string (receipt/invoice/ticket/transaction number)",
      "date": "YYYY-MM-DD",
      "city": "CITY, ST",
      "vendor": "string (store or company name)",
      "items": [
        { "type": "diesel", "gallons": number, "value": number },
        { "type": "def", "gallons": number, "value": number },
        { "type": "expense", "category": "one of: Mantenimiento|Seguro|Peajes|Reparacion|Llantas|Lavado|Parqueo|Multas|Comida|DEF|Otros", "description": "brief description", "amount": number }
      ]
    }
  ]
}

Rules:
- One object in "receipts" per physical receipt in the image, in the order they appear (left to right, top to bottom).
- A fuel receipt with BOTH diesel and DEF has both as separate items of that same receipt.
- A repair/maintenance invoice with several services has each service as a separate expense item.
- For each item use the amount actually paid for that item (with taxes if the receipt only shows a total).
- If a receipt is hard to read, still include it with what you can read: 0 for unreadable numbers, "" for unreadable text. Only return an empty "receipts" array if the image contains no receipt at all.
- Cities MUST be "CITY, ST" with the US state abbreviation.
- Source dates are US format mm/dd/yyyy (MONTH first). "6/1/2026" means June 1st -> "2026-06-01".
- Receipts are from the current operational year; use the current year for every date.
- Return ONLY valid JSON, no markdown, no explanation.`

async function postOpenRouter(body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://www.etg-tms.com',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!OPENROUTER_KEY) return res.status(500).json({ error: 'API key de OpenRouter no configurada' })

  // Only logged-in users of the app can scan
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Sesion no valida. Vuelve a iniciar sesion.' })
  const { data: userData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !userData?.user) return res.status(401).json({ error: 'Sesion no valida. Vuelve a iniciar sesion.' })

  const { base64, mimeType, fileName, kind } = req.body || {}
  if (!base64 || !mimeType) return res.status(400).json({ error: 'Falta el archivo' })
  if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
    return res.status(400).json({ error: 'Imagen no valida o formato no soportado.' })
  }

  const dataUrl = `data:${mimeType};base64,${base64}`
  const attachment = mimeType === 'application/pdf'
    ? { type: 'file', file: { filename: fileName || 'document.pdf', file_data: dataUrl } }
    : { type: 'image_url', image_url: { url: dataUrl } }

  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: [{ type: 'text', text: kind === 'receipt' ? RECEIPT_PROMPT : PROMPT }, attachment] }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: MAX_OUTPUT_TOKENS,
  }

  try {
    let response = await postOpenRouter(body)

    // Silent retry only for 503 (momentary blip)
    if (response.status === 503) {
      await new Promise(r => setTimeout(r, 1000))
      response = await postOpenRouter(body)
      if (!response.ok) return res.status(503).json({ error: 'Servicio no disponible. Intenta de nuevo en unos momentos.' })
    }

    if (response.status === 429) return res.status(429).json({ error: 'Limite de requests alcanzado. Intenta de nuevo en unos segundos.' })
    if (response.status === 402) return res.status(402).json({ error: 'Sin creditos en OpenRouter.' })
    if (response.status === 400) return res.status(400).json({ error: 'Imagen no valida o formato no soportado.' })
    if (!response.ok) return res.status(502).json({ error: `Error del servidor (${response.status}). Intenta de nuevo.` })

    const result = await response.json()
    const choice = result.choices?.[0]
    console.log('[scan]', userData.user.email, mimeType, JSON.stringify(result.usage || {}), choice?.finish_reason)

    // Hit the token cap — the model looped instead of finishing the JSON
    if (choice?.finish_reason === 'length') {
      return res.status(422).json({ error: 'No se pudo leer el documento. Intenta de nuevo o con una imagen mas clara.' })
    }

    const text = choice?.message?.content
    if (!text) return res.status(422).json({ error: 'No se pudo extraer datos de la imagen. Intenta con una foto mas clara.' })

    try {
      return res.status(200).json(JSON.parse(text))
    } catch {
      return res.status(422).json({ error: 'No se pudo leer el documento. Intenta de nuevo o con una imagen mas clara.' })
    }
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'El escaneo tardo demasiado. Intenta de nuevo.' })
    console.error('[scan]', err)
    return res.status(500).json({ error: 'Error del servidor. Intenta de nuevo.' })
  }
}
