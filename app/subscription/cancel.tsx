import React from 'react'
import { YStack, Text, Button } from '@tamagui/core'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

export default function SubscriptionCancel() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <YStack flex={1} backgroundColor="$cream" alignItems="center" justifyContent="center" padding="$6" gap="$6">
      <Text fontSize={24} fontWeight="700" color="$lavender" textAlign="center">{t('subscription.cancelTitle')}</Text>
      <Text color="$color" textAlign="center">{t('subscription.cancelBody')}</Text>
      <Button
        onPress={() => router.replace('/(tabs)')}
        backgroundColor="$lavender"
        color="white"
        borderRadius="$6"
        paddingHorizontal="$8"
      >
        {t('subscription.cancelCta')}
      </Button>
    </YStack>
  )
}
