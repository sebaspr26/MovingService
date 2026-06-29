import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { to, subject, html } = req.body

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html' })
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'ETG Moving Services <invoices@etg-tms.com>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.status(200).json({ success: true, id: data.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
