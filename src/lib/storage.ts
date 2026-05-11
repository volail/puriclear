import AsyncStorage from '@react-native-async-storage/async-storage'

const KEYS = {
  HAS_SEEN_ONBOARDING: 'hasSeenOnboarding',
  LOCALE_OVERRIDE: 'localeOverride',
} as const

export async function getHasSeenOnboarding(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.HAS_SEEN_ONBOARDING)
  return val === 'true'
}

export async function setHasSeenOnboarding(): Promise<void> {
  await AsyncStorage.setItem(KEYS.HAS_SEEN_ONBOARDING, 'true')
}

export async function getLocaleOverride(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.LOCALE_OVERRIDE)
}

export async function setLocaleOverride(locale: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.LOCALE_OVERRIDE, locale)
}
