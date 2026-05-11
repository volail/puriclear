import React, { useState } from 'react'
import { YStack, XStack, Text, Button, Separator } from '@tamagui/core'
import { ScrollView, Alert, Linking, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/contexts/AuthContext'
import { useSubscription } from '../../src/contexts/SubscriptionContext'
import { supabase } from '../../src/lib/supabase'
import i18n from '../../src/lib/i18n'
import { setLocaleOverride } from '../../src/lib/storage'

export default function Settings() {
  const { t } = useTranslation()
  const router = useRouter()
  const { session, signOut } = useAuth()
  const { status } = useSubscription()
  const [deletingAccount, setDeletingAccount] = useState(false)

  async function handleLanguageToggle(locale: 'ja' | 'en') {
    i18n.changeLanguage(locale)
    await setLocaleOverride(locale)
    if (session?.user?.id) {
      await supabase.from('users').update({ locale }).eq('id', session.user.id)
    }
  }

  async function handleManageSubscription() {
    if (Platform.OS === 'web') {
      const res = await supabase.functions.invoke('create-stripe-portal-session')
      if (res.data?.url) Linking.openURL(res.data.url)
    } else {
      Linking.openURL('https://apps.apple.com/account/subscriptions')
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      t('settings.deleteAccountConfirmTitle'),
      t('settings.deleteAccountConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true)
            const { error } = await supabase.functions.invoke('delete-account', {
              body: { confirm: true },
            })
            setDeletingAccount(false)
            if (error) { Alert.alert(t('common.error')); return }
            await signOut()
          },
        },
      ]
    )
  }

  const isPro = status?.plan === 'pro'
  const expiresAt = status?.expires_at
    ? new Date(status.expires_at).toLocaleDateString(i18n.language)
    : null

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF9FB' }}>
      <YStack padding="$4" gap="$4">
        <Text fontSize={24} fontWeight="700" color="$lavender">{t('settings.title')}</Text>

        <YStack gap="$2">
          <Text fontWeight="600" color="$color">{t('settings.language')}</Text>
          <XStack gap="$2">
            <Button
              flex={1}
              onPress={() => handleLanguageToggle('ja')}
              backgroundColor={i18n.language === 'ja' ? '$lavender' : '$grey'}
              color={i18n.language === 'ja' ? 'white' : '$color'}
              borderRadius="$4"
            >
              {t('settings.languageJa')}
            </Button>
            <Button
              flex={1}
              onPress={() => handleLanguageToggle('en')}
              backgroundColor={i18n.language === 'en' ? '$lavender' : '$grey'}
              color={i18n.language === 'en' ? 'white' : '$color'}
              borderRadius="$4"
            >
              {t('settings.languageEn')}
            </Button>
          </XStack>
        </YStack>

        <Separator />

        <YStack gap="$2">
          <Text fontWeight="600" color="$color">{t('settings.account')}</Text>
          <Text color="$color" opacity={0.7}>{session?.user?.email ?? session?.user?.id}</Text>
        </YStack>

        <Separator />

        <YStack gap="$2">
          <Text fontWeight="600" color="$color">{t('settings.subscription')}</Text>
          <Text color="$color">{isPro ? t('settings.planPro') : t('settings.planFree')}</Text>
          {isPro && expiresAt && (
            <Text color="$color" opacity={0.7}>{t('settings.renewalDate')}: {expiresAt}</Text>
          )}
          {isPro ? (
            <Button
              onPress={handleManageSubscription}
              backgroundColor="transparent"
              color="$lavender"
              paddingLeft={0}
            >
              {t('settings.manageSubscription')}
            </Button>
          ) : (
            <Button
              onPress={() => router.push('/subscription')}
              backgroundColor="$pink"
              color="white"
              borderRadius="$6"
            >
              {t('subscription.subscribe')}
            </Button>
          )}
        </YStack>

        <Separator />

        <YStack gap="$2">
          <Button onPress={() => Linking.openURL('https://puriclear.vercel.app/privacy')} backgroundColor="transparent" color="$color" paddingLeft={0}>{t('settings.privacyPolicy')}</Button>
          <Button onPress={() => Linking.openURL('https://puriclear.vercel.app/terms')} backgroundColor="transparent" color="$color" paddingLeft={0}>{t('settings.termsOfService')}</Button>
          <Button onPress={() => Linking.openURL('mailto:support@puriclear.app')} backgroundColor="transparent" color="$color" paddingLeft={0}>{t('settings.support')}</Button>
        </YStack>

        <Separator />

        <Button onPress={signOut} backgroundColor="$grey" color="$color" borderRadius="$6">
          {t('settings.signOut')}
        </Button>

        <Button
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
          backgroundColor="transparent"
          color="red"
          borderRadius="$6"
        >
          {t('settings.deleteAccount')}
        </Button>
      </YStack>
    </ScrollView>
  )
}
