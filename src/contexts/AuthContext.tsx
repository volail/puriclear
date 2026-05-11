import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type UserRow = { id: string; locale: string; created_at: string }

type AuthContextType = {
  session: Session | null
  userRow: UserRow | null
  isLoading: boolean
  signOut: () => Promise<void>
  refreshUserRow: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  userRow: null,
  isLoading: true,
  signOut: async () => {},
  refreshUserRow: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [userRow, setUserRow] = useState<UserRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function fetchUserRow(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      setUserRow(null)
      return
    }
    setUserRow(data)
  }

  const refreshUserRow = useCallback(async () => {
    if (session?.user?.id) await fetchUserRow(session.user.id)
  }, [session])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user?.id) fetchUserRow(data.session.user.id)
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user?.id) fetchUserRow(s.user.id)
      else setUserRow(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, userRow, isLoading, signOut, refreshUserRow }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
