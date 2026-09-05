import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = cargando

  useEffect(() => {
    // Refrescar sesión al montar para obtener user_metadata actualizado
    supabase.auth.refreshSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session)
      } else {
        // Si no hay sesión activa, getSession confirma el estado
        supabase.auth.getSession().then(({ data: d }) => setSession(d.session ?? null))
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function refreshSession() {
    const { data } = await supabase.auth.refreshSession()
    if (data.session) setSession(data.session)
  }

  return (
    <AuthContext.Provider value={{ session, refreshSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
