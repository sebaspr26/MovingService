import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Passkeys (Face ID / Touch ID / fingerprint) are a Supabase Auth beta and
// need this opt-in; they also have to be enabled in the Supabase dashboard
// (Authentication -> Passkeys). Password sign-in is unaffected.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { experimental: { passkey: true } },
})
