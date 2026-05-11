import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

type SubscriptionStatus = {
  plan: 'free' | 'pro'
  platform: string | null
  provider_customer_id: string | null
  monthly_count: number
  monthly_reset_date: string | null
  expires_at: string | null
  updated_at: string
}

type SubscriptionContextType = {
  status: SubscriptionStatus | null
  isLoading: boolean
  refresh: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  status: null,
  isLoading: true,
  refresh: async () => {},
})

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from('subscription_status')
      .select('*')
      .eq('user_id', session.user.id)
      .single()
    setStatus(data)
    setIsLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      refresh()
    } else {
      setStatus(null)
      setIsLoading(false)
    }
  }, [session?.user?.id, refresh])

  return (
    <SubscriptionContext.Provider value={{ status, isLoading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  return useContext(SubscriptionContext)
}
