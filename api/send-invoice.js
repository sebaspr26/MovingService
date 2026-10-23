import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_KEY)

function isOwnAttachmentUrl(raw) {
  let url
  try { url = new URL(String(raw)) } catch { return false }
  if (url.protocol !== 'https:') return false
  let ownHost = null
  try { ownHost = new URL(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL).hostname.toLowerCase() } catch { /* not set */ }
  const host = url.hostname.toLowerCase()
  const hostOk = ownHost ? host === ownHost : host.endsWith('.supabase.co')
  return hostOk && url.pathname.startsWith('/storage/v1/object/public/order-docs/email-attachments/')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { to, cc, subject, html, pdfBase64, pdfUrl, fileName } = req.body

  // Big PDFs arrive as a link to our own Storage (the body limit is 4.5MB) —
  // never attach a file from anywhere else
  // Compared by host + path, not as a raw string: the env URL may carry a
  // trailing slash or differ in case, which rejected valid links
  if (pdfUrl && !isOwnAttachmentUrl(pdfUrl)) {
    return res.status(400).json({ error: 'Adjunto no valido' })
  }

  if (!to || !subject) {
    return res.status(400).json({ error: 'Missing required fields: to, subject' })
  }

  try {
    const emailOptions = {
      from: 'ETG Moving Services <invoices@etg-tms.com>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || '<p>Please find the attached invoice.</p>',
    }

    if (cc && cc.length > 0) {
      emailOptions.cc = Array.isArray(cc) ? cc : [cc]
    }

    if (pdfBase64) {
      emailOptions.attachments = [{
        filename: fileName || 'invoice.pdf',
        content: Buffer.from(pdfBase64, 'base64'),
      }]
    } else if (pdfUrl) {
      // Resend downloads the file itself
      emailOptions.attachments = [{ filename: fileName || 'invoice.pdf', path: pdfUrl }]
    }

    const { data, error } = await resend.emails.send(emailOptions)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.status(200).json({ success: true, id: data.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
