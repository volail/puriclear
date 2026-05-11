import React, { useEffect, useState } from 'react'
import { YStack, Text, Button } from '@tamagui/core'
import { ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../src/contexts/AuthContext'
import { useSubscription } from '../../src/contexts/SubscriptionContext'
import { pollForProPlan } from '../../src/lib/subscriptionPolling'

export default function SubscriptionSuccess() {
  const { t } = useTranslation()
  const router = useRouter()
  const { session } = useAuth()
  const { refresh } = useSubscription()
  const [confirmed, setConfirmed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) return
    pollForProPlan(session.user.id, 10000, 2000).then(async ok => {
      if (ok) {
        await refresh()
        setConfirmed(true)
      } else {
        setTimedOut(true)
      }
    })
  }, [session?.user?.id])

  if (timedOut) {
    return (
      <YStack flex={1} backgroundColor="$cream" alignItems="center" justifyContent="center" padding="$6" gap="$4">
        <Text textAlign="center" color="$color">{t('subscription.timeoutMessage')}</Text>
      </YStack>
    )
  }

  if (!confirmed) {
    return (
      <YStack flex={1} backgroundColor="$cream" alignItems="center" justifyContent="center" gap="$4">
        <ActivityIndicator size="large" color="#C8B4E8" />
        <Text color="$color">{t('subscription.processingTitle')}</Text>
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$cream" alignItems="center" justifyContent="center" padding="$6" gap="$6">
      <Text fontSize={32}>✨</Text>
      <Text fontSize={24} fontWeight="700" color="$lavender" textAlign="center">{t('subscription.successTitle')}</Text>
      <Text color="$color" textAlign="center">{t('subscription.successBody')}</Text>
      <Button
        onPress={() => router.replace('/(tabs)')}
        backgroundColor="$lavender"
        color="white"
        borderRadius="$6"
        paddingHorizontal="$8"
      >
        {t('subscription.successCta')}
      </Button>
    </YStack>
  )
}
