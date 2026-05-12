import React, { useState } from 'react'
import { Text } from '@tamagui/core'
import { YStack } from '@tamagui/stacks'
import { Button } from '@tamagui/button'
import { ScrollView, Alert, Platform, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Purchases } from 'react-native-purchases'
import { useAuth } from '../src/contexts/AuthContext'
import { useSubscription } from '../src/contexts/SubscriptionContext'
import { supabase } from '../src/lib/supabase'
import { SubscriptionTable } from '../src/components/SubscriptionTable'

export default function Subscription() {
  const { t } = useTranslation()
  const router = useRouter()
  const { session } = useAuth()
  const { refresh } = useSubscription()
  const [loading, setLoading] = useState(false)

  async function handleSubscribe() {
    if (!session?.user?.id) return
    setLoading(true)
    try {
      if (Platform.OS === 'web') {
        const res = await supabase.functions.invoke('create-stripe-checkout-session')
        if (res.data?.url) Linking.openURL(res.data.url)
      } else {
        const offerings = await Purchases.getOfferings()
        const pkg = offerings.current?.availablePackages[0]
        if (!pkg) { Alert.alert(t('common.error')); return }
        await Purchases.purchasePackage(pkg)
        await refresh()
        router.replace('/(tabs)')
      }
    } catch (err: any) {
      if (err?.userCancelled) return
      Alert.alert(t('common.error'), err?.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRestore() {
    if (Platform.OS === 'web') return
    setLoading(true)
    try {
      await Purchases.restorePurchases()
      await refresh()
      router.replace('/(tabs)')
    } catch {
      Alert.alert(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF9FB' }}>
      <YStack padding="$6" gap="$6" alignItems="center">
        <Text fontSize={26} fontWeight="700" color="$lavender" textAlign="center">
          {t('subscription.title')}
        </Text>

        <SubscriptionTable />

        <Text fontSize={22} fontWeight="700" color="$color">{t('subscription.price')}</Text>

        <Button
          onPress={handleSubscribe}
          disabled={loading}
          backgroundColor="$lavender"
          color="white"
          borderRadius="$6"
          width="100%"
          height={52}
          fontSize={18}
          fontWeight="700"
        >
          {t('subscription.subscribe')}
        </Button>

        {Platform.OS !== 'web' && (
          <Button
            onPress={handleRestore}
            disabled={loading}
            backgroundColor="transparent"
            color="$color"
            opacity={0.6}
          >
            {t('subscription.restorePurchase')}
          </Button>
        )}

        <Button
          onPress={() => router.back()}
          backgroundColor="transparent"
          color="$color"
          opacity={0.5}
        >
          {t('common.cancel')}
        </Button>
      </YStack>
    </ScrollView>
  )
}
