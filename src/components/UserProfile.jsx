import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

const ROLE_NAMES = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  driver_lease: 'Driver LEASE',
}

function getAvatarUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('company-docs').getPublicUrl(path)
  return data?.publicUrl || null
}

export default function UserProfile() {
  const { session, refreshSession } = useAuth()
  const toast = useToast()
  const user = session?.user
  const meta = user?.user_metadata || {}

  const [name, setName] = useState(meta.name || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(() => getAvatarUrl(meta.avatar_path))
  const fileRef = useRef()

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || '?'

  const dirty = name !== (meta.name || '')

  async function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Solo se permiten imágenes'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no puede superar 5MB'); return }

    setUploading(true)
    try {
      if (meta.avatar_path) {
        await supabase.storage.from('company-docs').remove([meta.avatar_path])
      }
      const ext = file.name.split('.').pop()
      const path = `user-avatars/${user.id}/avatar_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('company-docs').upload(path, file)
      if (upErr) throw upErr

      const { error: updateErr } = await supabase.auth.updateUser({
        data: { ...meta, avatar_path: path },
      })
      if (updateErr) throw updateErr

      await refreshSession()
      setAvatarUrl(getAvatarUrl(path))
      toast.success('Foto actualizada')
    } catch (err) {
      toast.error('Error subiendo foto')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleRemoveAvatar() {
    const ok = await toast.confirm('¿Quitar la foto de perfil?')
    if (!ok) return
    setUploading(true)
    try {
      if (meta.avatar_path) {
        await supabase.storage.from('company-docs').remove([meta.avatar_path])
      }
      const { error } = await supabase.auth.updateUser({ data: { ...meta, avatar_path: null } })
      if (error) throw error
      await refreshSession()
      setAvatarUrl(null)
      toast.success('Foto eliminada')
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { ...meta, name } })
      if (error) throw error
      await refreshSession()
      toast.success('Perfil actualizado')
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Mi Perfil</h1>
        <p className="text-sm text-gray-500 mt-1">Gestiona tu información personal</p>
      </div>

      {/* Foto de perfil */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Foto de perfil</p>
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div
              className="w-20 h-20 rounded-full overflow-hidden relative flex items-center justify-center text-2xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
            >
              {initials}
              {avatarUrl && <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            </div>
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 transition-colors disabled:opacity-50"
            >
              {avatarUrl ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                disabled={uploading}
                className="px-4 py-2 text-sm text-left text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                Quitar foto
              </button>
            )}
            <p className="text-xs text-gray-600">JPG, PNG o WebP · Max 5MB</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
      </div>

      {/* Información personal */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Información personal</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre completo</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/70"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              className="w-full bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-600 mt-1">El email no se puede modificar desde aquí</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Rol</label>
            <input
              type="text"
              value={ROLE_NAMES[meta.role] || meta.role || 'Admin'}
              readOnly
              className="w-full bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-6 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
