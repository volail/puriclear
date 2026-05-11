import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { setHasSeenOnboarding } from '../../src/lib/storage'

const SCREENS = [
  { titleKey: 'onboarding.screen1Title', bodyKey: 'onboarding.screen1Body' },
  { titleKey: 'onboarding.screen2Title', bodyKey: 'onboarding.screen2Body' },
] as const

export default function Onboarding() {
  const { t } = useTranslation()
  const router = useRouter()
  const [step, setStep] = useState(0)

  async function handleNext() {
    if (step < SCREENS.length - 1) {
      setStep(step + 1)
    } else {
      await setHasSeenOnboarding()
      router.replace('/(auth)/login')
    }
  }

  const screen = SCREENS[step]
  const isLast = step === SCREENS.length - 1

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t(screen.titleKey)}</Text>
      <Text style={styles.body}>{t(screen.bodyKey)}</Text>

      <View style={styles.dots}>
        {SCREENS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === step ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>

      <TouchableOpacity onPress={handleNext} style={styles.button}>
        <Text style={styles.buttonText}>
          {isLast ? t('onboarding.getStarted') : t('onboarding.next')}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9FB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#C8B4E8',
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    color: '#2D2D2D',
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.8,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#C8B4E8',
  },
  dotInactive: {
    width: 8,
    backgroundColor: '#F2EEF5',
  },
  button: {
    backgroundColor: '#C8B4E8',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 24,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
