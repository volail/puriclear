import React from 'react'
import { Text } from '@tamagui/core'
import { YStack } from '@tamagui/stacks'
import { Button } from '@tamagui/button'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

export function EmptyGallery() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" gap="$4" padding="$8">
      <Text fontSize={64}>✨</Text>
      <Text fontSize={18} fontWeight="600" color="$lavender" textAlign="center">
        {t('gallery.empty')}
      </Text>
      <Button
        onPress={() => router.push('/(tabs)')}
        backgroundColor="$pink"
        color="white"
        borderRadius="$6"
        paddingHorizontal="$6"
      >
        {t('gallery.emptyAction')}
      </Button>
    </YStack>
  )
}
