import { supabase } from './supabase'

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ── Passkeys: sign in with Face ID / Touch ID / fingerprint ──

/** "Face ID" on iPhone/iPad, a generic name elsewhere */
export function biometricLabel() {
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && 'ontouchend' in document)) return 'Face ID'
  if (/Macintosh/.test(navigator.userAgent)) return 'Touch ID'
  if (/Android/.test(navigator.userAgent)) return 'huella'
  return 'llave de acceso'
}

export function passkeysSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials
}

// Whether passkeys are turned on in the Supabase project (Authentication ->
// Passkeys). Asking for a sign-in challenge is harmless (it just expires);
// a disabled project answers passkey_disabled. Asked once per page load, so
// the Face ID button only shows up once it actually works.
let enabledProbe = null
export function biometricsEnabled() {
  if (!passkeysSupported()) return Promise.resolve(false)
  enabledProbe ||= supabase.auth.passkey.startAuthentication()
    .then(({ error }) => !error)
    .catch(() => false)
  return enabledProbe
}

function passkeyError(error) {
  const msg = String(error?.message || error || '')
  if (error?.code === 'passkey_disabled') return 'El acceso con Face ID aún no está activado para la app. Avisa al administrador.'
  if (/NotAllowed|abort|cancel/i.test(msg) || error?.name === 'NotAllowedError') return 'Cancelado'
  if (/not enabled|disabled|passkey.*(off|enable)|404/i.test(msg)) return 'El acceso con Face ID aún no está activado para la app. Avisa al administrador.'
  if (/no.*credential|not found|unknown/i.test(msg)) return 'Este dispositivo no tiene Face ID registrado para tu cuenta. Entra con tu contraseña y actívalo en Mi perfil.'
  return msg || 'No se pudo completar'
}

export async function signInWithBiometrics() {
  const { data, error } = await supabase.auth.signInWithPasskey()
  if (error) throw new Error(passkeyError(error), { cause: error })
  return data
}

export async function registerBiometrics() {
  const { data, error } = await supabase.auth.registerPasskey()
  if (error) throw new Error(passkeyError(error), { cause: error })
  return data
}

export async function listBiometrics() {
  const { data, error } = await supabase.auth.passkey.list()
  if (error) throw new Error(passkeyError(error), { cause: error })
  return data || []
}

export async function removeBiometrics(passkeyId) {
  const { error } = await supabase.auth.passkey.delete({ passkeyId })
  if (error) throw new Error(passkeyError(error), { cause: error })
}
