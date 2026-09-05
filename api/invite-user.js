import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, email, password, name, role } = req.body

  if (!action || !email) {
    return res.status(400).json({ error: 'Faltan campos requeridos' })
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
      // Enviar link de invitación por email
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { name, role: role || 'user' },
        redirectTo: 'https://www.etg-tms.com/set-password',
      })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true, user: data.user })
    }

    if (action === 'list') {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers()
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true, users: data.users })
    }

    if (action === 'delete') {
      const { userId } = req.body
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Acción no válida' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
