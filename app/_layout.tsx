import '../src/lib/i18n'
import React, { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { TamaguiProvider } from '@tamagui/core'
import tamaguiConfig from '../src/tamagui.config'
import { AuthProvider, useAuth } from '../src/contexts/AuthContext'
import { SubscriptionProvider } from '../src/contexts/SubscriptionContext'
import { getHasSeenOnboarding } from '../src/lib/storage'

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth()
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    getHasSeenOnboarding().then(setHasSeenOnboarding)
  }, [])

  useEffect(() => {
    if (isLoading || hasSeenOnboarding === null) return

    const inAuth = segments[0] === '(auth)'
    const inTabs = segments[0] === '(tabs)'

    if (!hasSeenOnboarding) {
      router.replace('/(auth)/onboarding')
    } else if (!session && !inAuth) {
      router.replace('/(auth)/login')
    } else if (session && !inTabs) {
      router.replace('/(tabs)')
    }
  }, [session, isLoading, hasSeenOnboarding, segments])

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <TamaguiProvider config={tamaguiConfig}>
      <AuthProvider>
        <SubscriptionProvider>
          <NavigationGuard>
            <Stack>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="preview" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="subscription" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" />
            </Stack>
          </NavigationGuard>
        </SubscriptionProvider>
      </AuthProvider>
    </TamaguiProvider>
  )
}
