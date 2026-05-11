import React from 'react'
import { YStack, XStack, Text } from '@tamagui/core'
import { useTranslation } from 'react-i18next'

export function SubscriptionTable() {
  const { t } = useTranslation()
  const rows = [
    { label: t('subscription.uploadsPerDay'), free: '3', pro: '1,000 / mo' },
    { label: t('subscription.cloudAlbum'), free: '✓', pro: '✓' },
    { label: t('subscription.shareAnywhere'), free: '✓', pro: '✓' },
  ]
  return (
    <YStack borderRadius="$4" borderWidth={1} borderColor="$borderColor" overflow="hidden">
      <XStack backgroundColor="$lavender">
        <Text flex={2} padding="$3" color="white" fontWeight="600"> </Text>
        <Text flex={1} padding="$3" color="white" fontWeight="600" textAlign="center">{t('subscription.free')}</Text>
        <Text flex={1} padding="$3" color="white" fontWeight="600" textAlign="center">{t('subscription.pro')}</Text>
      </XStack>
      {rows.map((row, i) => (
        <XStack key={i} backgroundColor={i % 2 === 0 ? '$grey' : 'white'}>
          <Text flex={2} padding="$3" color="$color" fontSize={14}>{row.label}</Text>
          <Text flex={1} padding="$3" color="$color" textAlign="center">{row.free}</Text>
          <Text flex={1} padding="$3" color="$lavender" textAlign="center" fontWeight="700">{row.pro}</Text>
        </XStack>
      ))}
    </YStack>
  )
}
