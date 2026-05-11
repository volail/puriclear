import '../src/lib/i18n'
import i18n from 'i18next'

test('defaults to ja', () => {
  i18n.changeLanguage('ja')
  expect(i18n.t('common.upscale')).toBe('アップスケール')
})

test('switches to en', () => {
  i18n.changeLanguage('en')
  expect(i18n.t('common.upscale')).toBe('Upscale')
})

test('falls back to ja for key missing in en', () => {
  i18n.changeLanguage('en')
  // _jaOnly only exists in ja.json, not en.json — i18next should fall back to ja
  expect(i18n.t('common._jaOnly')).toBe('テスト専用')
})
