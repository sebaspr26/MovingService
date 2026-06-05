const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

const PROMPT = `Analyze this receipt/invoice image and extract the data into JSON format.
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
    "category": "one of: Mantenimiento|Seguro|Peajes|Reparacion|Llantas|Lavado|Parqueo|Multas|Comida|Otros",
    "invoice_number": "string",
    "description": "brief description",
    "amount": number,
    "date": "YYYY-MM-DD"
  }
}

Rules:
- Return ONLY valid JSON, no markdown, no extra text
- Use 0 for numbers you can't read
- Use "" for text you can't read
- Dates must be YYYY-MM-DD format
- For amounts, extract the total amount paid
- If it's clearly a fuel/diesel receipt, type is "diesel"
- If it's a load confirmation or bill of lading, type is "order"
- Otherwise, type is "expense"`

export async function analyzeReceipt(imageFile) {
  const base64 = await fileToBase64(imageFile)
  const mimeType = imageFile.type || 'image/jpeg'

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ]
        }]
      })
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error: ${err}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No response from Gemini')

  // Clean markdown code blocks if present
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  return JSON.parse(cleaned)
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
