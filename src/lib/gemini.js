const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY

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
    "category": "one of: Mantenimiento|Seguro|Peajes|Reparacion|Llantas|Lavado|Parqueo|Multas|Comida|DEF|Otros",
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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-nano-12b-v2-vl:free',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]
      }]
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Error al analizar: ${err}`)
  }

  const result = await response.json()
  const text = result.choices?.[0]?.message?.content
  if (!text) throw new Error('No se pudo analizar la imagen')

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
