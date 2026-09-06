import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function getCompanyData(companyId) {
  const query = supabaseAdmin.from('company_settings').select('company_info, logo_path')
  if (companyId) query.eq('id', companyId)
  const { data } = await query.limit(1).single()
  const companyName = data?.company_info?.company_name || data?.company_info?.dba || 'Moving Services'
  const logoUrl = data?.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/${data.logo_path}` : null
  return { companyName, logoUrl }
}

function logoBlock(logoUrl, companyName) {
  if (logoUrl) {
    return `<img src="${logoUrl}" alt="${companyName}" style="height:52px;max-width:200px;object-fit:contain;display:block;margin:0 auto 12px;" />`
  }
  // Fallback: iniciales de la empresa
  const initials = companyName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return `<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:rgba(234,88,12,0.15);border:1px solid rgba(234,88,12,0.3);border-radius:14px;margin-bottom:14px;font-size:20px;font-weight:700;color:#ea580c;">${initials}</div>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, email, password, name, role, companyId } = req.body

  if (!action) {
    return res.status(400).json({ error: 'Falta el campo action' })
  }
  if (!email && !['list', 'update_permissions', 'delete', 'update_role', 'migrate_dispatchers'].includes(action)) {
    return res.status(400).json({ error: 'Falta el campo email' })
  }

  try {
    if (action === 'create') {
      // Crear usuario con email + password
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role: role || 'user' },
      })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true, user: data.user })
    }

    if (action === 'invite') {
      // Generar el link sin que Supabase envíe el correo
      let linkData, linkError
      const inviteRes = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { name, role: role || 'user', needs_password: true },
          redirectTo: 'https://www.etg-tms.com/set-password',
        },
      })
      linkData = inviteRes.data
      linkError = inviteRes.error

      // Si el usuario ya existe, usar recovery (reset de contraseña) como fallback
      if (linkError?.message?.includes('already been registered') || linkError?.message?.includes('already registered')) {
        const recoveryRes = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: 'https://www.etg-tms.com/set-password' },
        })
        linkData = recoveryRes.data
        linkError = recoveryRes.error
      }

      if (linkError) return res.status(400).json({ error: linkError.message })

      const inviteUrl = linkData.properties?.action_link
      if (!inviteUrl) return res.status(500).json({ error: 'No se pudo generar el link' })

      const { companyName, logoUrl } = await getCompanyData(companyId)

      // Enviar por Resend con diseño personalizado
      const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 20px;">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      ${logoBlock(logoUrl, companyName)}
      <p style="margin:0;color:#ea580c;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${companyName}</p>
    </div>

    <!-- Card -->
    <div style="background:#111118;border:1px solid #1f1f2e;border-radius:20px;padding:36px;">
      <h1 style="margin:0 0 10px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
        ${name ? `Hola ${name},` : 'Hola,'} te han invitado
      </h1>
      <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.7;">
        Has sido agregado como <strong style="color:#9ca3af;">${role || 'usuario'}</strong> en el Sistema de Gestión de Transportes de ${companyName}.<br><br>
        Haz clic en el botón para crear tu contraseña y acceder al sistema.
      </p>

      <!-- Button -->
      <a href="${inviteUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:#ffffff;text-decoration:none;padding:15px 24px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:-0.2px;box-shadow:0 4px 24px rgba(234,88,12,0.35);">
        Activar mi cuenta &rarr;
      </a>

      <!-- Divider -->
      <div style="border-top:1px solid #1f1f2e;margin:28px 0;"></div>

      <p style="margin:0 0 8px;color:#4b5563;font-size:12px;">Si el botón no funciona, copia este enlace:</p>
      <p style="margin:0;color:#ea580c;font-size:11px;word-break:break-all;">${inviteUrl}</p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:24px;">
      <p style="margin:0;color:#374151;font-size:11px;">${companyName} &mdash; Sistema de Gestión de Transporte</p>
      <p style="margin:6px 0 0;color:#1f2937;font-size:10px;">Este enlace expira en 1 hora. Si no esperabas esta invitación, ignora este correo.</p>
    </div>

  </div>
</body>
</html>`

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        },
        body: JSON.stringify({
          from: `${companyName} <noreply@etg-tms.com>`,
          to: [email],
          subject: `Invitación — ${companyName}`,
          html,
        }),
      })

      if (!resendRes.ok) {
        const err = await resendRes.json()
        return res.status(500).json({ error: `Resend error: ${err.message}` })
      }

      return res.status(200).json({ success: true, user: linkData.user })
    }

    if (action === 'list') {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true, users: data.users })
    }

    if (action === 'delete') {
      const { userId } = req.body
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true })
    }

    if (action === 'resend') {
      const { userId, name: rName, role: rRole } = req.body
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { name: rName, role: rRole || 'user', needs_password: true },
          redirectTo: 'https://www.etg-tms.com/set-password',
        },
      })
      if (error) return res.status(400).json({ error: error.message })
      const inviteUrl = data.properties?.action_link
      if (!inviteUrl) return res.status(500).json({ error: 'No se pudo generar el link' })
      const { companyName: rCompanyName, logoUrl: rLogoUrl } = await getCompanyData(companyId)
      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><div style="max-width:480px;margin:0 auto;padding:40px 20px;"><div style="text-align:center;margin-bottom:32px;">${logoBlock(rLogoUrl, rCompanyName)}<p style="margin:0;color:#ea580c;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${rCompanyName}</p></div><div style="background:#111118;border:1px solid #1f1f2e;border-radius:20px;padding:36px;"><h1 style="margin:0 0 10px;color:#ffffff;font-size:22px;font-weight:700;">Nueva invitación</h1><p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.7;">Te enviamos un nuevo enlace de acceso. El anterior ya no es válido.</p><a href="${inviteUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#ea580c,#c2410c);color:#ffffff;text-decoration:none;padding:15px 24px;border-radius:12px;font-size:15px;font-weight:700;">Activar mi cuenta &rarr;</a><div style="border-top:1px solid #1f1f2e;margin:28px 0;"></div><p style="margin:0 0 8px;color:#4b5563;font-size:12px;">Si el botón no funciona, copia este enlace:</p><p style="margin:0;color:#ea580c;font-size:11px;word-break:break-all;">${inviteUrl}</p></div><div style="text-align:center;margin-top:24px;"><p style="margin:0;color:#374151;font-size:11px;">${rCompanyName} — Sistema de Gestión de Transporte</p></div></div></body></html>`
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_KEY}` },
        body: JSON.stringify({ from: `${rCompanyName} <noreply@etg-tms.com>`, to: [email], subject: `Nueva invitación — ${rCompanyName}`, html }),
      })
      if (!resendRes.ok) {
        const err = await resendRes.json()
        return res.status(500).json({ error: `Resend error: ${err.message}` })
      }
      return res.status(200).json({ success: true })
    }

    if (action === 'update_permissions') {
      const { userId, permissions, allowed_companies, allowed_trucks, name, dispatcher_rates, company_id } = req.body
      const { data: current } = await supabaseAdmin.auth.admin.getUserById(userId)
      const existing = current?.user?.user_metadata || {}
      const updated = { ...existing }
      if (name !== undefined) updated.name = name
      if (allowed_companies !== undefined) updated.allowed_companies = allowed_companies

      if (company_id) {
        // Per-company: store permissions, allowed_trucks, dispatcher_rates under company_settings[company_id]
        const existingCS = existing.company_settings || {}
        const existingForCompany = existingCS[company_id] || {}
        updated.company_settings = {
          ...existingCS,
          [company_id]: {
            ...existingForCompany,
            ...(permissions !== undefined ? { permissions } : {}),
            ...(allowed_trucks !== undefined ? { allowed_trucks } : {}),
            ...(dispatcher_rates !== undefined ? { dispatcher_rates } : {}),
          },
        }
      } else {
        // Legacy fallback — top-level
        if (permissions !== undefined) updated.permissions = permissions
        if (allowed_trucks !== undefined) updated.allowed_trucks = allowed_trucks
        if (dispatcher_rates !== undefined) updated.dispatcher_rates = dispatcher_rates
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: updated })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true })
    }

    if (action === 'add_to_company') {
      const { userId, company_id } = req.body
      if (!userId || !company_id) return res.status(400).json({ error: 'userId and company_id required' })
      const { data: current } = await supabaseAdmin.auth.admin.getUserById(userId)
      const existing = current?.user?.user_metadata || {}
      const existingCompanies = existing.allowed_companies || []
      if (!existingCompanies.includes(company_id)) {
        const updated = { ...existing, allowed_companies: [...existingCompanies, company_id] }
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: updated })
        if (error) return res.status(400).json({ error: error.message })
      }
      return res.status(200).json({ success: true })
    }

    if (action === 'update_role') {
      const { userId, role: newRole } = req.body
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { role: newRole },
      })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true })
    }

    if (action === 'migrate_dispatchers') {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
      const nameToEmail = {}
      for (const u of usersData?.users || []) {
        const name = (u.user_metadata?.name || '').trim()
        if (name && u.email) nameToEmail[name.toLowerCase()] = u.email
      }
      const supabaseDb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { data: orders } = await supabaseDb.from('orders').select('id, dispatcher').not('dispatcher', 'is', null).neq('dispatcher', '')
      let migrated = 0
      for (const order of orders || []) {
        if (order.dispatcher.includes('@')) continue
        const email = nameToEmail[order.dispatcher.trim().toLowerCase()]
        if (!email) continue
        await supabaseDb.from('orders').update({ dispatcher: email }).eq('id', order.id)
        migrated++
      }
      return res.status(200).json({ success: true, migrated })
    }

    return res.status(400).json({ error: 'Acción no válida' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
