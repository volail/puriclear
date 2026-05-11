import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import ja from '../locales/ja.json'
import en from '../locales/en.json'

const deviceLang = getLocales()[0]?.languageCode ?? 'ja'
const supportedLng = ['ja', 'en']
const lng = supportedLng.includes(deviceLang) ? deviceLang : 'ja'

i18n.use(initReactI18next).init({
  resources: { ja: { translation: ja }, en: { translation: en } },
  lng,
  fallbackLng: 'ja',
  interpolation: { escapeValue: false },
})

export default i18n
