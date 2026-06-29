import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { to, subject, html, pdfBase64, fileName } = req.body

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

    if (pdfBase64) {
      emailOptions.attachments = [{
        filename: fileName || 'invoice.pdf',
        content: Buffer.from(pdfBase64, 'base64'),
      }]
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
