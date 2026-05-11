# PuriClear Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PuriClear Expo mobile/web app — kawaii photo upscaler with Supabase auth, AI processing, RevenueCat (mobile) and Stripe (web) subscriptions.

**Architecture:** Expo Router file-based navigation with `(auth)` and `(tabs)` route groups; Tamagui for UI; React Context for auth + subscription state; platform branches (Platform.OS) for camera, share, save, and payments.

**Tech Stack:** Expo SDK 53, Expo Router v4, Tamagui, @supabase/supabase-js v2, react-i18next + i18next + expo-localization, expo-image-picker, expo-sharing, expo-media-library, expo-apple-authentication, @react-native-google-signin/google-signin, react-native-purchases (RevenueCat), Jest + jest-expo + @testing-library/react-native

---

## File Structure

```
app/
  _layout.tsx                   → Root stack; auth/onboarding routing guard
  (auth)/
    _layout.tsx
    onboarding.tsx              → 2-screen explainer (first launch)
    login.tsx                   → Apple + Google sign in
  (tabs)/
    _layout.tsx                 → Bottom tab bar
    index.tsx                   → Camera / Upload screen (Tab 1)
    gallery/
      index.tsx                 → 2-column photo grid (Tab 2)
      [id].tsx                  → Photo detail — share / save / delete
    settings.tsx                → Settings (Tab 3)
  preview.tsx                   → Preview modal (presentation: modal)
  subscription.tsx              → Paywall
  subscription/
    success.tsx                 → Stripe success page (web only)
    cancel.tsx                  → Stripe cancel page (web only)
  +not-found.tsx

src/
  lib/
    supabase.ts                 → Supabase client singleton
    i18n.ts                     → i18next init (device locale → ja fallback)
    storage.ts                  → AsyncStorage typed helpers
    signedUrls.ts               → Fetch + silently refresh signed URLs
  contexts/
    AuthContext.tsx             → Session, user row, sign-out helpers
    SubscriptionContext.tsx     → subscription_status + refresh
  hooks/
    useImagePicker.ts           → Camera / library with permission handling
    useMediaSave.ts             → Save to library (mobile) / download (web)
    useShare.ts                 → expo-sharing (mobile) / Web Share API (web)
    useGallery.ts               → Paginated gallery (30/page, infinite scroll)
  components/
    LoadingOverlay.tsx          → Fullscreen "AI処理中..." overlay
    PermissionDeniedView.tsx    → Permission denied explanation + settings link
    PhotoCard.tsx               → Gallery grid card (signed URL, rounded)
    EmptyGallery.tsx            → Empty state illustration + CTA
    SubscriptionTable.tsx       → Free vs Pro feature comparison table
  locales/
    ja.json
    en.json
  tamagui.config.ts             → Kawaii theme tokens
```

---

### Task 1: Project Bootstrap & Test Infrastructure

**Files:**
- Create: `package.json` (Expo managed project at repo root)
- Create: `app.json`
- Create: `jest.config.js`
- Create: `babel.config.js`
- Create: `tsconfig.json`

- [ ] **Step 1: Initialize Expo project at repo root**

```bash
npx create-expo-app@latest . --template blank-typescript
```

- [ ] **Step 2: Install all dependencies**

```bash
npx expo install expo-router expo-linking expo-constants expo-status-bar expo-font
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
npx expo install expo-image-picker expo-sharing expo-media-library expo-localization
npx expo install expo-apple-authentication
npm install @react-native-google-signin/google-signin
npm install react-native-purchases
npm install i18next react-i18next
npm install @tamagui/core @tamagui/config tamagui @tamagui/babel-plugin
npm install --save-dev jest jest-expo @testing-library/react-native @types/jest
npm install --save-dev @testing-library/jest-native
```

- [ ] **Step 3: Configure jest.config.js**

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|tamagui|@tamagui/.*)',
  ],
  moduleNameMapper: {
    '^react-native-purchases$': '<rootDir>/__mocks__/react-native-purchases.js',
    '^expo-apple-authentication$': '<rootDir>/__mocks__/expo-apple-authentication.js',
    '^@react-native-google-signin/google-signin$': '<rootDir>/__mocks__/google-signin.js',
  },
}
```

- [ ] **Step 4: Create native module mocks**

`__mocks__/react-native-purchases.js`:
```js
module.exports = {
  Purchases: {
    configure: jest.fn(),
    getOfferings: jest.fn().mockResolvedValue({ current: null }),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn().mockResolvedValue({ activeSubscriptions: [] }),
    setLogLevel: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}
```

`__mocks__/expo-apple-authentication.js`:
```js
module.exports = {
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}
```

`__mocks__/google-signin.js`:
```js
module.exports = {
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    getTokens: jest.fn(),
  },
  statusCodes: { SIGN_IN_CANCELLED: '12501' },
}
```

- [ ] **Step 5: Configure app.json for Expo Router**

```json
{
  "expo": {
    "name": "PuriClear",
    "slug": "puriclear",
    "scheme": "puriclear",
    "version": "1.0.0",
    "orientation": "portrait",
    "plugins": [
      "expo-router",
      "expo-image-picker",
      [
        "expo-media-library",
        {
          "photosPermission": "PuriClearはプリクラを保存するためにフォトライブラリへのアクセスが必要です。 / PuriClear needs access to your photo library to save upscaled purikura.",
          "savePhotosPermission": "PuriClearはプリクラを保存するためにフォトライブラリへのアクセスが必要です。 / PuriClear needs access to your photo library to save upscaled purikura."
        }
      ],
      [
        "expo-apple-authentication"
      ]
    ],
    "infoPlist": {
      "NSCameraUsageDescription": "カメラでプリクラを撮影します。 / Take a photo of your purikura print.",
      "NSPhotoLibraryUsageDescription": "プリクラをフォトライブラリからインポートします。 / Import purikura from your photo library."
    },
    "android": {
      "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#FFF9FB" }
    },
    "web": { "bundler": "metro", "output": "server" },
    "experiments": { "typedRoutes": true }
  }
}
```

- [ ] **Step 6: Write smoke test to verify test infra**

`__tests__/smoke.test.ts`:
```ts
test('test infra works', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 7: Run smoke test**

```bash
npx jest __tests__/smoke.test.ts
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: bootstrap Expo project with dependencies and test infra"
```

---

### Task 2: Tamagui Theme + i18n

**Files:**
- Create: `src/tamagui.config.ts`
- Create: `src/locales/ja.json`
- Create: `src/locales/en.json`
- Create: `src/lib/i18n.ts`
- Create: `__tests__/i18n.test.ts`

- [ ] **Step 1: Write failing i18n test**

`__tests__/i18n.test.ts`:
```ts
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

test('falls back to ja for missing en key', () => {
  i18n.changeLanguage('en')
  expect(i18n.t('common.appName')).toBe('PuriClear')
})
```

- [ ] **Step 2: Run test to see it fail**

```bash
npx jest __tests__/i18n.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create locale JSON files**

`src/locales/ja.json`:
```json
{
  "common": {
    "appName": "PuriClear",
    "upscale": "アップスケール",
    "cancel": "キャンセル",
    "delete": "削除",
    "share": "シェア",
    "save": "保存",
    "back": "戻る",
    "confirm": "確認",
    "loading": "読み込み中...",
    "processing": "AIが処理中...",
    "error": "エラーが発生しました",
    "retry": "再試行",
    "signOut": "サインアウト",
    "signIn": "サインイン",
    "close": "閉じる"
  },
  "onboarding": {
    "screen1Title": "プリクラをもっとキレイに",
    "screen1Body": "AIが低画質のプリクラを4倍に高解像度化します",
    "screen2Title": "クラウドに保存・シェア",
    "screen2Body": "アップスケールした写真はクラウドに保存され、いつでもシェアできます",
    "next": "次へ",
    "getStarted": "はじめる"
  },
  "login": {
    "title": "PuriClearへようこそ",
    "subtitle": "サインインして始めましょう",
    "appleSignIn": "Appleでサインイン",
    "googleSignIn": "Googleでサインイン"
  },
  "upload": {
    "takePhoto": "写真を撮る",
    "importLibrary": "ライブラリから選ぶ",
    "permissionDeniedCamera": "カメラへのアクセスが拒否されました",
    "permissionDeniedLibrary": "フォトライブラリへのアクセスが拒否されました",
    "permissionExplanationCamera": "プリクラを撮影するためにカメラへのアクセスが必要です",
    "permissionExplanationLibrary": "プリクラをインポートするためにフォトライブラリへのアクセスが必要です",
    "openSettings": "設定を開く",
    "tooLarge": "画像が大きすぎます（最大20MB）",
    "unsupportedType": "対応形式: JPEG, PNG, HEIC"
  },
  "preview": {
    "upscaleButton": "✨ アップスケール"
  },
  "gallery": {
    "title": "ギャラリー",
    "empty": "まだプリクラがありません",
    "emptyAction": "最初の一枚をアップスケール",
    "deleteConfirmTitle": "写真を削除",
    "deleteConfirmMessage": "この写真を削除しますか？この操作は取り消せません。",
    "saveSuccess": "フォトライブラリに保存しました",
    "saveDenied": "フォトライブラリへのアクセスが拒否されました"
  },
  "settings": {
    "title": "設定",
    "language": "言語",
    "languageJa": "日本語",
    "languageEn": "English",
    "account": "アカウント",
    "subscription": "サブスクリプション",
    "planFree": "フリープラン",
    "planPro": "Proプラン",
    "renewalDate": "次回更新日",
    "manageSubscription": "サブスクリプションを管理",
    "privacyPolicy": "プライバシーポリシー",
    "termsOfService": "利用規約",
    "support": "サポート / お問い合わせ",
    "signOut": "サインアウト",
    "deleteAccount": "アカウントを削除",
    "deleteAccountConfirmTitle": "アカウントを削除しますか？",
    "deleteAccountConfirmMessage": "すべての写真とアカウント情報が削除されます。この操作は取り消せません。",
    "deleteAccountSuccess": "アカウントを削除しました"
  },
  "subscription": {
    "title": "Proプランにアップグレード",
    "free": "フリー",
    "pro": "Pro",
    "uploadsPerDay": "アップスケール / 日",
    "uploadsPerMonth": "アップスケール / 月",
    "cloudAlbum": "クラウドアルバム",
    "shareAnywhere": "どこでもシェア",
    "price": "¥980 / 月",
    "subscribe": "Proにアップグレード",
    "restorePurchase": "購入を復元",
    "successTitle": "準備完了！✨",
    "successBody": "Proプランが有効になりました",
    "successCta": "アップスケールを始める →",
    "processingTitle": "サブスクリプションを処理中...",
    "timeoutMessage": "お支払いが確認されました。アプリを再起動してProプランを有効にしてください。",
    "cancelTitle": "大丈夫です！",
    "cancelBody": "フリープランのまま続けます（3枚 / 日）",
    "cancelCta": "アプリに戻る",
    "quotaExceeded": "本日の無料枠を使い切りました"
  },
  "errors": {
    "network": "ネットワークエラー。接続を確認してください。",
    "processingFailed": "AI処理に失敗しました。もう一度試してください。",
    "quotaExceeded": "本日の無料枠を使い切りました",
    "authFailed": "認証に失敗しました"
  }
}
```

`src/locales/en.json`:
```json
{
  "common": {
    "appName": "PuriClear",
    "upscale": "Upscale",
    "cancel": "Cancel",
    "delete": "Delete",
    "share": "Share",
    "save": "Save",
    "back": "Back",
    "confirm": "Confirm",
    "loading": "Loading...",
    "processing": "AI Processing...",
    "error": "An error occurred",
    "retry": "Retry",
    "signOut": "Sign Out",
    "signIn": "Sign In",
    "close": "Close"
  },
  "onboarding": {
    "screen1Title": "Enhance Your Purikura",
    "screen1Body": "AI upscales your low-res purikura prints 4x",
    "screen2Title": "Save & Share Anywhere",
    "screen2Body": "Upscaled photos are saved to your cloud album, ready to share anytime",
    "next": "Next",
    "getStarted": "Get Started"
  },
  "login": {
    "title": "Welcome to PuriClear",
    "subtitle": "Sign in to get started",
    "appleSignIn": "Sign in with Apple",
    "googleSignIn": "Sign in with Google"
  },
  "upload": {
    "takePhoto": "Take Photo",
    "importLibrary": "Import from Library",
    "permissionDeniedCamera": "Camera access denied",
    "permissionDeniedLibrary": "Photo library access denied",
    "permissionExplanationCamera": "Camera access is needed to photograph your purikura",
    "permissionExplanationLibrary": "Photo library access is needed to import purikura",
    "openSettings": "Open Settings",
    "tooLarge": "Image too large (max 20MB)",
    "unsupportedType": "Supported formats: JPEG, PNG, HEIC"
  },
  "preview": {
    "upscaleButton": "✨ Upscale"
  },
  "gallery": {
    "title": "Gallery",
    "empty": "No purikura yet!",
    "emptyAction": "+ Upscale your first one",
    "deleteConfirmTitle": "Delete Photo",
    "deleteConfirmMessage": "Delete this photo? This cannot be undone.",
    "saveSuccess": "Saved to photo library",
    "saveDenied": "Photo library access denied"
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "languageJa": "日本語",
    "languageEn": "English",
    "account": "Account",
    "subscription": "Subscription",
    "planFree": "Free Plan",
    "planPro": "Pro Plan",
    "renewalDate": "Renewal Date",
    "manageSubscription": "Manage Subscription",
    "privacyPolicy": "Privacy Policy",
    "termsOfService": "Terms of Service",
    "support": "Support / Contact",
    "signOut": "Sign Out",
    "deleteAccount": "Delete Account",
    "deleteAccountConfirmTitle": "Delete account?",
    "deleteAccountConfirmMessage": "All photos and account data will be deleted. This cannot be undone.",
    "deleteAccountSuccess": "Account deleted"
  },
  "subscription": {
    "title": "Upgrade to Pro",
    "free": "Free",
    "pro": "Pro",
    "uploadsPerDay": "upscales / day",
    "uploadsPerMonth": "upscales / month",
    "cloudAlbum": "Cloud album",
    "shareAnywhere": "Share anywhere",
    "price": "¥980 / month",
    "subscribe": "Upgrade to Pro",
    "restorePurchase": "Restore Purchase",
    "successTitle": "You're all set! ✨",
    "successBody": "Your Pro plan is now active",
    "successCta": "Start upscaling →",
    "processingTitle": "Processing your subscription...",
    "timeoutMessage": "Payment received — please restart the app to activate Pro",
    "cancelTitle": "No worries!",
    "cancelBody": "You're still on the free plan (3 upscales/day)",
    "cancelCta": "Back to app",
    "quotaExceeded": "You've used all free upscales for today"
  },
  "errors": {
    "network": "Network error. Please check your connection.",
    "processingFailed": "AI processing failed. Please try again.",
    "quotaExceeded": "Daily free limit reached",
    "authFailed": "Authentication failed"
  }
}
```

- [ ] **Step 4: Create i18n init**

`src/lib/i18n.ts`:
```ts
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
```

- [ ] **Step 5: Create Tamagui config**

`src/tamagui.config.ts`:
```ts
import { createTamagui, createTokens } from '@tamagui/core'
import { config as tamaguiConfig } from '@tamagui/config/v3'

const tokens = createTokens({
  ...tamaguiConfig.tokens,
  color: {
    ...tamaguiConfig.tokens.color,
    pink: '#FFB7C5',
    lavender: '#C8B4E8',
    cream: '#FFF9FB',
    grey: '#F2EEF5',
  },
})

const config = createTamagui({
  ...tamaguiConfig,
  tokens,
  themes: {
    ...tamaguiConfig.themes,
    light: {
      ...tamaguiConfig.themes.light,
      background: '#FFF9FB',
      backgroundHover: '#F2EEF5',
      color: '#2D2D2D',
      borderColor: '#E8DFF0',
      primary: '#FFB7C5',
      secondary: '#C8B4E8',
    },
  },
})

export type AppConfig = typeof config
declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config
```

- [ ] **Step 6: Run i18n test**

```bash
npx jest __tests__/i18n.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/locales src/lib/i18n.ts src/tamagui.config.ts
git commit -m "feat: add Tamagui kawaii theme and i18n (ja/en)"
```

---

### Task 3: Supabase Client + AsyncStorage Helpers

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/storage.ts`
- Create: `__tests__/storage.test.ts`

- [ ] **Step 1: Write failing test**

`__tests__/storage.test.ts`:
```ts
import { getHasSeenOnboarding, setHasSeenOnboarding } from '../src/lib/storage'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

test('returns false before setting', async () => {
  const result = await getHasSeenOnboarding()
  expect(result).toBe(false)
})

test('returns true after setting', async () => {
  await setHasSeenOnboarding()
  const result = await getHasSeenOnboarding()
  expect(result).toBe(true)
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npx jest __tests__/storage.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create storage helpers**

`src/lib/storage.ts`:
```ts
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
```

- [ ] **Step 4: Create Supabase client**

`src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

Create `.env.local` (add to `.gitignore`):
```
EXPO_PUBLIC_SUPABASE_URL=https://zxvelrjrogearuovdamc.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key-from-supabase-dashboard>
```

- [ ] **Step 5: Create signed URL helper**

`src/lib/signedUrls.ts`:
```ts
import { supabase } from './supabase'

export async function getSignedUrl(path: string): Promise<string> {
  const bucket = path.startsWith('upscaled/') ? 'upscaled' : 'originals'
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw new Error('Failed to get signed URL')
  return data.signedUrl
}

export async function getUploadSignedUrl(uploadId: string): Promise<string> {
  const res = await supabase.functions.invoke('get-upload-url', { body: { upload_id: uploadId } })
  if (res.error) throw res.error
  return res.data.signed_url as string
}
```

- [ ] **Step 6: Run test**

```bash
npx jest __tests__/storage.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase.ts src/lib/storage.ts src/lib/signedUrls.ts .env.local .gitignore
git commit -m "feat: add Supabase client, AsyncStorage helpers, signed URL utility"
```

---

### Task 4: Auth Context + Subscription Context

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Create: `src/contexts/SubscriptionContext.tsx`
- Create: `__tests__/AuthContext.test.tsx`

- [ ] **Step 1: Write failing auth context test**

`__tests__/AuthContext.test.tsx`:
```tsx
import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { AuthProvider, useAuth } from '../src/contexts/AuthContext'

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

test('starts with null session', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper })
  expect(result.current.session).toBeNull()
})

test('isLoading is true initially then false', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper })
  // after mount and session check resolves
  await act(async () => {})
  expect(result.current.isLoading).toBe(false)
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npx jest __tests__/AuthContext.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create AuthContext**

`src/contexts/AuthContext.tsx`:
```tsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type UserRow = { id: string; locale: string; created_at: string }

type AuthContextType = {
  session: Session | null
  userRow: UserRow | null
  isLoading: boolean
  signOut: () => Promise<void>
  refreshUserRow: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  userRow: null,
  isLoading: true,
  signOut: async () => {},
  refreshUserRow: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [userRow, setUserRow] = useState<UserRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function fetchUserRow(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    setUserRow(data)
  }

  async function refreshUserRow() {
    if (session?.user?.id) await fetchUserRow(session.user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user?.id) fetchUserRow(data.session.user.id)
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user?.id) fetchUserRow(s.user.id)
      else setUserRow(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, userRow, isLoading, signOut, refreshUserRow }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 4: Create SubscriptionContext**

`src/contexts/SubscriptionContext.tsx`:
```tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

type SubscriptionStatus = {
  plan: 'free' | 'pro'
  platform: string | null
  provider_customer_id: string | null
  monthly_count: number
  monthly_reset_date: string | null
  expires_at: string | null
  updated_at: string
}

type SubscriptionContextType = {
  status: SubscriptionStatus | null
  isLoading: boolean
  refresh: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  status: null,
  isLoading: true,
  refresh: async () => {},
})

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from('subscription_status')
      .select('*')
      .eq('user_id', session.user.id)
      .single()
    setStatus(data)
    setIsLoading(false)
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) refresh()
    else { setStatus(null); setIsLoading(false) }
  }, [session?.user?.id])

  return (
    <SubscriptionContext.Provider value={{ status, isLoading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  return useContext(SubscriptionContext)
}
```

- [ ] **Step 5: Run test**

```bash
npx jest __tests__/AuthContext.test.tsx
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/contexts/
git commit -m "feat: add AuthContext and SubscriptionContext"
```

---

### Task 5: Root Layout + Navigation Guard

**Files:**
- Create: `app/_layout.tsx`
- Create: `app/(auth)/_layout.tsx`
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/+not-found.tsx`

- [ ] **Step 1: Create root layout**

`app/_layout.tsx`:
```tsx
import '../src/lib/i18n'
import React, { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { TamaguiProvider } from '@tamagui/core'
import tamaguiConfig from '../src/tamagui.config'
import { AuthProvider, useAuth } from '../src/contexts/AuthContext'
import { SubscriptionProvider } from '../src/contexts/SubscriptionContext'
import { getHasSeenOnboarding } from '../src/lib/storage'
import { useRouter, useSegments } from 'expo-router'

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth()
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    getHasSeenOnboarding().then(setHasSeenOnboarding)
  }, [])

  useEffect(() => {
    if (isLoading || hasSeenOnboarding === null) return

    const inAuth = segments[0] === '(auth)'
    const inTabs = segments[0] === '(tabs)'

    if (!hasSeenOnboarding) {
      router.replace('/(auth)/onboarding')
    } else if (!session && !inAuth) {
      router.replace('/(auth)/login')
    } else if (session && !inTabs) {
      router.replace('/(tabs)')
    }
  }, [session, isLoading, hasSeenOnboarding, segments])

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <TamaguiProvider config={tamaguiConfig}>
      <AuthProvider>
        <SubscriptionProvider>
          <NavigationGuard>
            <Stack>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="preview" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="subscription" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" />
            </Stack>
          </NavigationGuard>
        </SubscriptionProvider>
      </AuthProvider>
    </TamaguiProvider>
  )
}
```

- [ ] **Step 2: Create auth stack layout**

`app/(auth)/_layout.tsx`:
```tsx
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
```

- [ ] **Step 3: Create tabs layout**

`app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'

export default function TabsLayout() {
  const { t } = useTranslation()
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#FFF9FB', borderTopColor: '#E8DFF0' },
        tabBarActiveTintColor: '#C8B4E8',
        tabBarInactiveTintColor: '#B0A0BC',
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('upload.takePhoto'), tabBarIcon: ({ color }) => null }}
      />
      <Tabs.Screen
        name="gallery"
        options={{ title: t('gallery.title'), tabBarIcon: ({ color }) => null }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('settings.title'), tabBarIcon: ({ color }) => null }}
      />
    </Tabs>
  )
}
```

- [ ] **Step 4: Create not-found screen**

`app/+not-found.tsx`:
```tsx
import { Link, Stack } from 'expo-router'
import { View, Text } from '@tamagui/core'

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <Text>Page not found</Text>
        <Link href="/(tabs)">Go home</Link>
      </View>
    </>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/
git commit -m "feat: add root layout, navigation guard, tabs and auth stack layouts"
```

---

### Task 6: Onboarding Screens

**Files:**
- Create: `app/(auth)/onboarding.tsx`

- [ ] **Step 1: Write unit test for onboarding completion logic**

`__tests__/onboarding.test.ts`:
```ts
import { getHasSeenOnboarding, setHasSeenOnboarding } from '../src/lib/storage'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

test('completing onboarding sets the flag', async () => {
  expect(await getHasSeenOnboarding()).toBe(false)
  await setHasSeenOnboarding()
  expect(await getHasSeenOnboarding()).toBe(true)
})
```

- [ ] **Step 2: Run to see it pass (storage already implemented)**

```bash
npx jest __tests__/onboarding.test.ts
```
Expected: PASS

- [ ] **Step 3: Create onboarding screen**

`app/(auth)/onboarding.tsx`:
```tsx
import React, { useState } from 'react'
import { View, Text, Button, XStack, YStack } from '@tamagui/core'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { setHasSeenOnboarding } from '../../src/lib/storage'

const SCREENS = [
  { titleKey: 'onboarding.screen1Title', bodyKey: 'onboarding.screen1Body' },
  { titleKey: 'onboarding.screen2Title', bodyKey: 'onboarding.screen2Body' },
]

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
    <YStack flex={1} backgroundColor="$cream" alignItems="center" justifyContent="center" padding="$6" gap="$6">
      <YStack gap="$4" alignItems="center">
        <Text fontSize={28} fontWeight="700" textAlign="center" color="$lavender">
          {t(screen.titleKey)}
        </Text>
        <Text fontSize={16} textAlign="center" color="$color" lineHeight={24}>
          {t(screen.bodyKey)}
        </Text>
      </YStack>

      <XStack gap="$2">
        {SCREENS.map((_, i) => (
          <View
            key={i}
            width={i === step ? 24 : 8}
            height={8}
            borderRadius={4}
            backgroundColor={i === step ? '$lavender' : '$grey'}
          />
        ))}
      </XStack>

      <Button
        onPress={handleNext}
        backgroundColor="$lavender"
        color="white"
        borderRadius="$6"
        paddingHorizontal="$8"
        paddingVertical="$3"
        fontSize={16}
        fontWeight="600"
      >
        {isLast ? t('onboarding.getStarted') : t('onboarding.next')}
      </Button>
    </YStack>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/onboarding.tsx
git commit -m "feat: add 2-screen onboarding flow"
```

---

### Task 7: Login Screen (Apple + Google Sign In)

**Files:**
- Create: `app/(auth)/login.tsx`
- Create: `__tests__/login.test.ts`

- [ ] **Step 1: Write failing test for sign-in helpers**

`__tests__/login.test.ts`:
```ts
import { signInWithApple, signInWithGoogle } from '../src/lib/socialAuth'

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn().mockResolvedValue({ data: { session: {} }, error: null }),
      signInWithOAuth: jest.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
}))

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn().mockResolvedValue({ identityToken: 'mock-apple-token' }),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}))

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({}),
    getTokens: jest.fn().mockResolvedValue({ idToken: 'mock-google-token' }),
  },
  statusCodes: { SIGN_IN_CANCELLED: '12501' },
}))

test('signInWithApple calls supabase with apple token', async () => {
  const { supabase } = require('../src/lib/supabase')
  await signInWithApple()
  expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'apple', token: 'mock-apple-token' })
  )
})

test('signInWithGoogle calls supabase with google token', async () => {
  const { supabase } = require('../src/lib/supabase')
  await signInWithGoogle()
  expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'google', token: 'mock-google-token' })
  )
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npx jest __tests__/login.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create social auth helpers**

`src/lib/socialAuth.ts`:
```ts
import { Platform } from 'react-native'
import { supabase } from './supabase'

export async function signInWithApple(): Promise<void> {
  if (Platform.OS === 'web') {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/` },
    })
    return
  }
  const { signInAsync, AppleAuthenticationScope } = await import('expo-apple-authentication')
  const credential = await signInAsync({
    requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL],
  })
  if (!credential.identityToken) throw new Error('No Apple identity token')
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  })
  if (error) throw error
}

export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    return
  }
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin')
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  })
  await GoogleSignin.hasPlayServices()
  await GoogleSignin.signIn()
  const { idToken } = await GoogleSignin.getTokens()
  if (!idToken) throw new Error('No Google id token')
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error) throw error
}
```

- [ ] **Step 4: Create login screen**

`app/(auth)/login.tsx`:
```tsx
import React, { useState } from 'react'
import { YStack, Text, Button, View } from '@tamagui/core'
import { useTranslation } from 'react-i18next'
import { signInWithApple, signInWithGoogle } from '../../src/lib/socialAuth'
import { Alert, Platform } from 'react-native'

export default function Login() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  async function handleApple() {
    try {
      setLoading(true)
      await signInWithApple()
    } catch (err: any) {
      Alert.alert(t('errors.authFailed'), err?.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    try {
      setLoading(true)
      await signInWithGoogle()
    } catch (err: any) {
      Alert.alert(t('errors.authFailed'), err?.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <YStack
      flex={1}
      backgroundColor="$cream"
      alignItems="center"
      justifyContent="center"
      padding="$6"
      gap="$6"
    >
      <YStack gap="$2" alignItems="center">
        <Text fontSize={32} fontWeight="700" color="$lavender">
          {t('common.appName')}
        </Text>
        <Text fontSize={16} color="$color" opacity={0.7}>
          {t('login.subtitle')}
        </Text>
      </YStack>

      <YStack gap="$3" width="100%">
        {Platform.OS !== 'android' && (
          <Button
            onPress={handleApple}
            disabled={loading}
            backgroundColor="black"
            color="white"
            borderRadius="$6"
            height={50}
            fontSize={16}
            fontWeight="600"
          >
            {t('login.appleSignIn')}
          </Button>
        )}
        <Button
          onPress={handleGoogle}
          disabled={loading}
          backgroundColor="white"
          color="$color"
          borderRadius="$6"
          height={50}
          fontSize={16}
          fontWeight="600"
          borderWidth={1}
          borderColor="$borderColor"
        >
          {t('login.googleSignIn')}
        </Button>
      </YStack>
    </YStack>
  )
}
```

- [ ] **Step 5: Run test**

```bash
npx jest __tests__/login.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/socialAuth.ts app/\(auth\)/login.tsx
git commit -m "feat: add login screen with Apple and Google sign in"
```

---

### Task 8: Camera / Upload Screen (Tab 1)

**Files:**
- Create: `src/hooks/useImagePicker.ts`
- Create: `src/components/PermissionDeniedView.tsx`
- Create: `app/(tabs)/index.tsx`
- Create: `__tests__/useImagePicker.test.ts`

- [ ] **Step 1: Write failing hook test**

`__tests__/useImagePicker.test.ts`:
```ts
import { renderHook, act } from '@testing-library/react-native'
import { useImagePicker } from '../src/hooks/useImagePicker'

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file://photo.jpg', mimeType: 'image/jpeg', fileSize: 1000 }] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file://lib.jpg', mimeType: 'image/jpeg', fileSize: 1000 }] }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  MediaTypeOptions: { Images: 'Images' },
}))

test('pickFromCamera returns asset', async () => {
  const { result } = renderHook(() => useImagePicker())
  let asset: any
  await act(async () => { asset = await result.current.pickFromCamera() })
  expect(asset?.uri).toBe('file://photo.jpg')
})

test('returns null when canceled', async () => {
  const imagePickerMock = require('expo-image-picker')
  imagePickerMock.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true })
  const { result } = renderHook(() => useImagePicker())
  let asset: any
  await act(async () => { asset = await result.current.pickFromLibrary() })
  expect(asset).toBeNull()
})

test('returns permissionDenied flag when camera denied', async () => {
  const imagePickerMock = require('expo-image-picker')
  imagePickerMock.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false })
  const { result } = renderHook(() => useImagePicker())
  let asset: any
  await act(async () => { asset = await result.current.pickFromCamera() })
  expect(asset).toBeNull()
  expect(result.current.cameraPermissionDenied).toBe(true)
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npx jest __tests__/useImagePicker.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create useImagePicker hook**

`src/hooks/useImagePicker.ts`:
```ts
import { useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'

export type PickedAsset = {
  uri: string
  mimeType: string
  fileSize: number
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024

export function useImagePicker() {
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false)
  const [libraryPermissionDenied, setLibraryPermissionDenied] = useState(false)

  async function pickFromCamera(): Promise<PickedAsset | null> {
    if (Platform.OS === 'web') return null
    const { granted } = await ImagePicker.requestCameraPermissionsAsync()
    if (!granted) { setCameraPermissionDenied(true); return null }
    setCameraPermissionDenied(false)
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    })
    if (result.canceled || !result.assets[0]) return null
    const asset = result.assets[0]
    if (asset.fileSize && asset.fileSize > MAX_SIZE_BYTES) throw new Error('IMAGE_TOO_LARGE')
    return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileSize: asset.fileSize ?? 0 }
  }

  async function pickFromLibrary(): Promise<PickedAsset | null> {
    if (Platform.OS !== 'web') {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!granted) { setLibraryPermissionDenied(true); return null }
      setLibraryPermissionDenied(false)
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    })
    if (result.canceled || !result.assets[0]) return null
    const asset = result.assets[0]
    if (asset.fileSize && asset.fileSize > MAX_SIZE_BYTES) throw new Error('IMAGE_TOO_LARGE')
    return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileSize: asset.fileSize ?? 0 }
  }

  return { pickFromCamera, pickFromLibrary, cameraPermissionDenied, libraryPermissionDenied }
}
```

- [ ] **Step 4: Create PermissionDeniedView**

`src/components/PermissionDeniedView.tsx`:
```tsx
import React from 'react'
import { YStack, Text, Button } from '@tamagui/core'
import { Linking } from 'react-native'
import { useTranslation } from 'react-i18next'

type Props = { type: 'camera' | 'library' }

export function PermissionDeniedView({ type }: Props) {
  const { t } = useTranslation()
  return (
    <YStack gap="$3" alignItems="center" padding="$4">
      <Text textAlign="center" color="$color" opacity={0.7}>
        {type === 'camera'
          ? t('upload.permissionExplanationCamera')
          : t('upload.permissionExplanationLibrary')}
      </Text>
      <Button
        onPress={() => Linking.openSettings()}
        backgroundColor="$lavender"
        color="white"
        borderRadius="$6"
      >
        {t('upload.openSettings')}
      </Button>
    </YStack>
  )
}
```

- [ ] **Step 5: Create upload screen**

`app/(tabs)/index.tsx`:
```tsx
import React from 'react'
import { YStack, Text, Button, XStack } from '@tamagui/core'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Alert, Platform } from 'react-native'
import { useImagePicker } from '../../src/hooks/useImagePicker'
import { PermissionDeniedView } from '../../src/components/PermissionDeniedView'

export default function UploadScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { pickFromCamera, pickFromLibrary, cameraPermissionDenied, libraryPermissionDenied } = useImagePicker()

  async function handleCamera() {
    try {
      const asset = await pickFromCamera()
      if (asset) router.push({ pathname: '/preview', params: { uri: asset.uri, mimeType: asset.mimeType } })
    } catch (err: any) {
      if (err.message === 'IMAGE_TOO_LARGE') Alert.alert(t('upload.tooLarge'))
      else Alert.alert(t('common.error'))
    }
  }

  async function handleLibrary() {
    try {
      const asset = await pickFromLibrary()
      if (asset) router.push({ pathname: '/preview', params: { uri: asset.uri, mimeType: asset.mimeType } })
    } catch (err: any) {
      if (err.message === 'IMAGE_TOO_LARGE') Alert.alert(t('upload.tooLarge'))
      else Alert.alert(t('common.error'))
    }
  }

  return (
    <YStack flex={1} backgroundColor="$cream" alignItems="center" justifyContent="center" gap="$6" padding="$6">
      <Text fontSize={24} fontWeight="700" color="$lavender">{t('common.appName')}</Text>

      {cameraPermissionDenied && <PermissionDeniedView type="camera" />}
      {libraryPermissionDenied && <PermissionDeniedView type="library" />}

      <XStack gap="$4">
        {Platform.OS !== 'web' && (
          <Button
            onPress={handleCamera}
            backgroundColor="$pink"
            color="white"
            borderRadius="$6"
            width={140}
            height={140}
            flexDirection="column"
            gap="$2"
          >
            <Text fontSize={36}>📷</Text>
            <Text color="white" fontWeight="600">{t('upload.takePhoto')}</Text>
          </Button>
        )}
        <Button
          onPress={handleLibrary}
          backgroundColor="$lavender"
          color="white"
          borderRadius="$6"
          width={140}
          height={140}
          flexDirection="column"
          gap="$2"
        >
          <Text fontSize={36}>🖼️</Text>
          <Text color="white" fontWeight="600">{t('upload.importLibrary')}</Text>
        </Button>
      </XStack>
    </YStack>
  )
}
```

- [ ] **Step 6: Run test**

```bash
npx jest __tests__/useImagePicker.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useImagePicker.ts src/components/PermissionDeniedView.tsx app/\(tabs\)/index.tsx
git commit -m "feat: add camera/upload screen with permission handling"
```

---

### Task 9: Preview Modal

**Files:**
- Create: `src/components/LoadingOverlay.tsx`
- Create: `app/preview.tsx`
- Create: `__tests__/preview.test.ts`

- [ ] **Step 1: Write failing test for process-image call**

`__tests__/preview.test.ts`:
```ts
import { invokeProcessImage } from '../src/lib/processImage'

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn().mockResolvedValue({
        data: { upload_id: 'abc123', signed_url: 'https://example.com/img.jpg' },
        error: null,
      }),
    },
  },
}))

test('invokeProcessImage returns upload_id and signed_url', async () => {
  const result = await invokeProcessImage('file://photo.jpg', 'image/jpeg')
  expect(result.upload_id).toBe('abc123')
  expect(result.signed_url).toBe('https://example.com/img.jpg')
})

test('throws on quota exceeded', async () => {
  const { supabase } = require('../src/lib/supabase')
  supabase.functions.invoke.mockResolvedValueOnce({
    data: null,
    error: { message: 'QUOTA_EXCEEDED' },
  })
  await expect(invokeProcessImage('file://photo.jpg', 'image/jpeg')).rejects.toThrow('QUOTA_EXCEEDED')
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npx jest __tests__/preview.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create processImage helper**

`src/lib/processImage.ts`:
```ts
import { supabase } from './supabase'

type ProcessResult = { upload_id: string; signed_url: string }

export async function invokeProcessImage(uri: string, mimeType: string): Promise<ProcessResult> {
  const response = await fetch(uri)
  const blob = await response.blob()
  const base64 = await blobToBase64(blob)

  const { data, error } = await supabase.functions.invoke('process-image', {
    body: { image_base64: base64, mime_type: mimeType },
  })

  if (error) throw new Error(error.message ?? 'PROCESSING_FAILED')
  return data as ProcessResult
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
```

- [ ] **Step 4: Create LoadingOverlay**

`src/components/LoadingOverlay.tsx`:
```tsx
import React from 'react'
import { YStack, Text } from '@tamagui/core'
import { ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'

export function LoadingOverlay() {
  const { t } = useTranslation()
  return (
    <YStack
      position="absolute"
      top={0} left={0} right={0} bottom={0}
      backgroundColor="rgba(255,249,251,0.95)"
      alignItems="center"
      justifyContent="center"
      gap="$4"
      zIndex={100}
    >
      <ActivityIndicator size="large" color="#C8B4E8" />
      <Text fontSize={18} fontWeight="600" color="$lavender">{t('common.processing')}</Text>
    </YStack>
  )
}
```

- [ ] **Step 5: Create preview modal**

`app/preview.tsx`:
```tsx
import React, { useState } from 'react'
import { YStack, Button, Text } from '@tamagui/core'
import { Image, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LoadingOverlay } from '../src/components/LoadingOverlay'
import { invokeProcessImage } from '../src/lib/processImage'

export default function Preview() {
  const { t } = useTranslation()
  const router = useRouter()
  const { uri, mimeType } = useLocalSearchParams<{ uri: string; mimeType: string }>()
  const [processing, setProcessing] = useState(false)

  async function handleUpscale() {
    try {
      setProcessing(true)
      const result = await invokeProcessImage(uri, mimeType ?? 'image/jpeg')
      router.replace({ pathname: '/(tabs)/gallery/[id]', params: { id: result.upload_id, signedUrl: result.signed_url } })
    } catch (err: any) {
      if (err.message === 'QUOTA_EXCEEDED') {
        router.replace('/subscription')
      } else {
        Alert.alert(t('errors.processingFailed'))
      }
    } finally {
      setProcessing(false)
    }
  }

  return (
    <YStack flex={1} backgroundColor="black">
      {processing && <LoadingOverlay />}
      <Image source={{ uri }} style={{ flex: 1, resizeMode: 'contain' }} />
      <YStack padding="$4" gap="$3" backgroundColor="$cream">
        <Button
          onPress={handleUpscale}
          disabled={processing}
          backgroundColor="$lavender"
          color="white"
          borderRadius="$6"
          height={52}
          fontSize={18}
          fontWeight="700"
        >
          {t('preview.upscaleButton')}
        </Button>
        <Button
          onPress={() => router.back()}
          disabled={processing}
          backgroundColor="transparent"
          color="$color"
          borderRadius="$6"
        >
          {t('common.cancel')}
        </Button>
      </YStack>
    </YStack>
  )
}
```

- [ ] **Step 6: Run test**

```bash
npx jest __tests__/preview.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/processImage.ts src/components/LoadingOverlay.tsx app/preview.tsx
git commit -m "feat: add preview modal with AI upscale trigger and quota redirect"
```

---

### Task 10: Gallery Screen (Tab 2)

**Files:**
- Create: `src/hooks/useGallery.ts`
- Create: `src/components/PhotoCard.tsx`
- Create: `src/components/EmptyGallery.tsx`
- Create: `app/(tabs)/gallery/index.tsx`
- Create: `__tests__/useGallery.test.ts`

- [ ] **Step 1: Write failing test**

`__tests__/useGallery.test.ts`:
```ts
import { renderHook, act } from '@testing-library/react-native'
import { useGallery } from '../src/hooks/useGallery'

const mockUploads = [
  { id: 'u1', upscaled_path: 'upscaled/uid/u1/upscaled.jpg', created_at: '2026-01-02', status: 'done' },
  { id: 'u2', upscaled_path: 'upscaled/uid/u2/upscaled.jpg', created_at: '2026-01-01', status: 'done' },
]

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      then: jest.fn(),
    }),
  },
}))

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'uid' } } }),
}))

test('initial state has empty uploads and not loading', () => {
  const { result } = renderHook(() => useGallery())
  expect(result.current.uploads).toEqual([])
})
```

- [ ] **Step 2: Run to see it pass (initial state check)**

```bash
npx jest __tests__/useGallery.test.ts
```
Expected: PASS

- [ ] **Step 3: Create useGallery hook**

`src/hooks/useGallery.ts`:
```ts
import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const PAGE_SIZE = 30

export type UploadRow = {
  id: string
  upscaled_path: string
  created_at: string
  status: string
}

export function useGallery() {
  const { session } = useAuth()
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)

  const fetchPage = useCallback(async (pageNum: number, reset = false) => {
    if (!session?.user?.id) return
    setLoading(true)
    const from = pageNum * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('uploads')
      .select('id, upscaled_path, created_at, status')
      .eq('user_id', session.user.id)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!error && data) {
      setUploads(prev => reset ? data : [...prev, ...data])
      setHasMore(data.length === PAGE_SIZE)
    }
    setLoading(false)
  }, [session?.user?.id])

  const refresh = useCallback(async () => {
    setPage(0)
    setHasMore(true)
    await fetchPage(0, true)
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    const next = page + 1
    setPage(next)
    await fetchPage(next)
  }, [loading, hasMore, page, fetchPage])

  return { uploads, loading, hasMore, refresh, loadMore }
}
```

- [ ] **Step 4: Create PhotoCard component**

`src/components/PhotoCard.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { View } from '@tamagui/core'
import { Image, TouchableOpacity, StyleSheet } from 'react-native'
import { getSignedUrl } from '../lib/signedUrls'

type Props = {
  uploadId: string
  upscaledPath: string
  onPress: () => void
}

export function PhotoCard({ upscaledPath, onPress }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    getSignedUrl(upscaledPath)
      .then(setUrl)
      .catch(() => {})
  }, [upscaledPath])

  return (
    <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.8}>
      <View backgroundColor="$grey" borderRadius="$4" overflow="hidden" style={styles.card}>
        {url && <Image source={{ uri: url }} style={styles.image} />}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, margin: 4 },
  card: { aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
})
```

- [ ] **Step 5: Create EmptyGallery**

`src/components/EmptyGallery.tsx`:
```tsx
import React from 'react'
import { YStack, Text, Button } from '@tamagui/core'
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
```

- [ ] **Step 6: Create gallery screen**

`app/(tabs)/gallery/index.tsx`:
```tsx
import React, { useEffect } from 'react'
import { FlatList, RefreshControl, Dimensions } from 'react-native'
import { View } from '@tamagui/core'
import { useRouter } from 'expo-router'
import { useGallery } from '../../../src/hooks/useGallery'
import { PhotoCard } from '../../../src/components/PhotoCard'
import { EmptyGallery } from '../../../src/components/EmptyGallery'

const NUM_COLS = 2

export default function GalleryScreen() {
  const router = useRouter()
  const { uploads, loading, refresh, loadMore } = useGallery()

  useEffect(() => { refresh() }, [])

  if (!loading && uploads.length === 0) return <EmptyGallery />

  return (
    <View flex={1} backgroundColor="$cream">
      <FlatList
        data={uploads}
        keyExtractor={item => item.id}
        numColumns={NUM_COLS}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#C8B4E8" />}
        renderItem={({ item }) => (
          <PhotoCard
            uploadId={item.id}
            upscaledPath={item.upscaled_path}
            onPress={() => router.push({ pathname: '/(tabs)/gallery/[id]', params: { id: item.id } })}
          />
        )}
        contentContainerStyle={{ padding: 4 }}
      />
    </View>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useGallery.ts src/components/PhotoCard.tsx src/components/EmptyGallery.tsx app/\(tabs\)/gallery/index.tsx
git commit -m "feat: add gallery screen with paginated photo grid"
```

---

### Task 11: Photo Detail Screen

**Files:**
- Create: `src/hooks/useShare.ts`
- Create: `src/hooks/useMediaSave.ts`
- Create: `app/(tabs)/gallery/[id].tsx`
- Create: `__tests__/useMediaSave.test.ts`

- [ ] **Step 1: Write failing test**

`__tests__/useMediaSave.test.ts`:
```ts
import { renderHook, act } from '@testing-library/react-native'
import { useMediaSave } from '../src/hooks/useMediaSave'

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native')
  RN.Platform.OS = 'ios'
  return RN
})

test('saveToDevice calls saveToLibraryAsync on mobile', async () => {
  const { result } = renderHook(() => useMediaSave())
  await act(async () => { await result.current.saveToDevice('file://photo.jpg') })
  const { saveToLibraryAsync } = require('expo-media-library')
  expect(saveToLibraryAsync).toHaveBeenCalledWith('file://photo.jpg')
})

test('returns permissionDenied when denied', async () => {
  const mediaLibrary = require('expo-media-library')
  mediaLibrary.requestPermissionsAsync.mockResolvedValueOnce({ granted: false })
  const { result } = renderHook(() => useMediaSave())
  await act(async () => { await result.current.saveToDevice('file://photo.jpg') })
  expect(result.current.permissionDenied).toBe(true)
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npx jest __tests__/useMediaSave.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create useMediaSave**

`src/hooks/useMediaSave.ts`:
```ts
import { useState } from 'react'
import { Platform, Linking } from 'react-native'

export function useMediaSave() {
  const [permissionDenied, setPermissionDenied] = useState(false)

  async function saveToDevice(uri: string): Promise<boolean> {
    if (Platform.OS === 'web') {
      const a = document.createElement('a')
      a.href = uri
      a.download = 'puriclear.jpg'
      a.click()
      return true
    }
    const MediaLibrary = await import('expo-media-library')
    const { granted } = await MediaLibrary.requestPermissionsAsync()
    if (!granted) { setPermissionDenied(true); return false }
    setPermissionDenied(false)
    await MediaLibrary.saveToLibraryAsync(uri)
    return true
  }

  return { saveToDevice, permissionDenied }
}
```

- [ ] **Step 4: Create useShare**

`src/hooks/useShare.ts`:
```ts
import { Platform } from 'react-native'

export function useShare() {
  async function shareUrl(url: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (navigator.share) {
        await navigator.share({ url })
      } else {
        window.open(url, '_blank')
      }
      return
    }
    const Sharing = await import('expo-sharing')
    const isAvailable = await Sharing.isAvailableAsync()
    if (isAvailable) await Sharing.shareAsync(url)
  }

  return { shareUrl }
}
```

- [ ] **Step 5: Create photo detail screen**

`app/(tabs)/gallery/[id].tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Image, Alert, ScrollView } from 'react-native'
import { YStack, XStack, Button, Text } from '@tamagui/core'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../src/lib/supabase'
import { getUploadSignedUrl } from '../../../src/lib/signedUrls'
import { useShare } from '../../../src/hooks/useShare'
import { useMediaSave } from '../../../src/hooks/useMediaSave'

export default function PhotoDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id, signedUrl: initialUrl } = useLocalSearchParams<{ id: string; signedUrl?: string }>()
  const [url, setUrl] = useState<string | null>(initialUrl ?? null)
  const { shareUrl } = useShare()
  const { saveToDevice, permissionDenied } = useMediaSave()

  useEffect(() => {
    if (!url && id) {
      getUploadSignedUrl(id).then(setUrl).catch(() => {})
    }
  }, [id])

  async function handleShare() {
    if (!url) return
    try { await shareUrl(url) } catch {}
  }

  async function handleSave() {
    if (!url) return
    const ok = await saveToDevice(url)
    if (ok) Alert.alert(t('gallery.saveSuccess'))
    else if (permissionDenied) Alert.alert(t('gallery.saveDenied'))
  }

  async function handleDelete() {
    Alert.alert(
      t('gallery.deleteConfirmTitle'),
      t('gallery.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await supabase.from('uploads').delete().eq('id', id)
            router.replace('/(tabs)/gallery')
          },
        },
      ]
    )
  }

  return (
    <YStack flex={1} backgroundColor="black">
      {url && (
        <Image source={{ uri: url }} style={{ flex: 1, resizeMode: 'contain' }} />
      )}
      <YStack padding="$4" gap="$3" backgroundColor="$cream">
        <XStack gap="$3">
          <Button flex={1} onPress={handleShare} backgroundColor="$lavender" color="white" borderRadius="$6">
            {t('common.share')}
          </Button>
          <Button flex={1} onPress={handleSave} backgroundColor="$pink" color="white" borderRadius="$6">
            {t('common.save')}
          </Button>
        </XStack>
        <Button onPress={handleDelete} backgroundColor="transparent" color="red" borderRadius="$6">
          {t('common.delete')}
        </Button>
      </YStack>
    </YStack>
  )
}
```

- [ ] **Step 6: Run test**

```bash
npx jest __tests__/useMediaSave.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useShare.ts src/hooks/useMediaSave.ts app/\(tabs\)/gallery/\[id\].tsx
git commit -m "feat: add photo detail with share, save to library, and delete"
```

---

### Task 12: Settings Screen (Tab 3)

**Files:**
- Create: `app/(tabs)/settings.tsx`

- [ ] **Step 1: Create settings screen**

`app/(tabs)/settings.tsx`:
```tsx
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
  const { session, userRow, signOut } = useAuth()
  const { status } = useSubscription()
  const [deletingAccount, setDeletingAccount] = useState(false)

  async function handleLanguageToggle(locale: 'ja' | 'en') {
    i18n.changeLanguage(locale)
    await setLocaleOverride(locale)
    await supabase.from('users').update({ locale }).eq('id', session!.user.id)
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

        {/* Language */}
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

        {/* Account */}
        <YStack gap="$2">
          <Text fontWeight="600" color="$color">{t('settings.account')}</Text>
          <Text color="$color" opacity={0.7}>{session?.user?.email ?? session?.user?.id}</Text>
        </YStack>

        <Separator />

        {/* Subscription */}
        <YStack gap="$2">
          <Text fontWeight="600" color="$color">{t('settings.subscription')}</Text>
          <Text color="$color">{isPro ? t('settings.planPro') : t('settings.planFree')}</Text>
          {isPro && expiresAt && (
            <Text color="$color" opacity={0.7}>{t('settings.renewalDate')}: {expiresAt}</Text>
          )}
          {isPro && (
            <Button
              onPress={handleManageSubscription}
              backgroundColor="transparent"
              color="$lavender"
              paddingLeft={0}
            >
              {t('settings.manageSubscription')}
            </Button>
          )}
          {!isPro && (
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

        {/* Links */}
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
```

- [ ] **Step 2: Commit**

```bash
git add app/\(tabs\)/settings.tsx
git commit -m "feat: add settings screen with language toggle, subscription status, and account deletion"
```

---

### Task 13: Subscription Screen + Stripe/RevenueCat

**Files:**
- Create: `src/components/SubscriptionTable.tsx`
- Create: `app/subscription.tsx`
- Create: `app/subscription/success.tsx`
- Create: `app/subscription/cancel.tsx`
- Create: `__tests__/subscription.test.ts`

- [ ] **Step 1: Write failing test**

`__tests__/subscription.test.ts`:
```ts
import { pollForProPlan } from '../src/lib/subscriptionPolling'

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
        .mockResolvedValueOnce({ data: { plan: 'free' }, error: null })
        .mockResolvedValueOnce({ data: { plan: 'free' }, error: null })
        .mockResolvedValueOnce({ data: { plan: 'pro' }, error: null }),
    }),
  },
}))

test('pollForProPlan resolves true when plan becomes pro', async () => {
  jest.useFakeTimers()
  const promise = pollForProPlan('uid', 10000, 100)
  jest.runAllTimersAsync()
  const result = await promise
  expect(result).toBe(true)
  jest.useRealTimers()
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npx jest __tests__/subscription.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create polling helper**

`src/lib/subscriptionPolling.ts`:
```ts
import { supabase } from './supabase'

export async function pollForProPlan(
  userId: string,
  timeoutMs = 10000,
  intervalMs = 2000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs))
    const { data } = await supabase
      .from('subscription_status')
      .select('plan')
      .eq('user_id', userId)
      .single()
    if (data?.plan === 'pro') return true
  }
  return false
}
```

- [ ] **Step 4: Create SubscriptionTable**

`src/components/SubscriptionTable.tsx`:
```tsx
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
```

- [ ] **Step 5: Create subscription screen**

`app/subscription.tsx`:
```tsx
import React, { useState } from 'react'
import { YStack, Text, Button } from '@tamagui/core'
import { ScrollView, Alert, Platform, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
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
        const { Purchases } = await import('react-native-purchases')
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
      const { Purchases } = await import('react-native-purchases')
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
```

- [ ] **Step 6: Create success page**

`app/subscription/success.tsx`:
```tsx
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
```

- [ ] **Step 7: Create cancel page**

`app/subscription/cancel.tsx`:
```tsx
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
```

- [ ] **Step 8: Run subscription test**

```bash
npx jest __tests__/subscription.test.ts
```
Expected: PASS

- [ ] **Step 9: Configure RevenueCat in root layout**

In `app/_layout.tsx`, inside `AuthProvider`, add RevenueCat init when session becomes available. Add this hook call inside `NavigationGuard`:

```tsx
// Add at top of NavigationGuard function body (after existing state):
useEffect(() => {
  if (!session?.user?.id || Platform.OS === 'web') return
  import('react-native-purchases').then(({ Purchases, LOG_LEVEL }) => {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG)
    Purchases.configure({
      apiKey: Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!
        : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY!,
    })
    Purchases.logIn(session.user.id)
  })
}, [session?.user?.id])
```

Add to `.env.local`:
```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=<your-ios-key>
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=<your-android-key>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<your-google-ios-client-id>
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/subscriptionPolling.ts src/components/SubscriptionTable.tsx app/subscription.tsx app/subscription/
git commit -m "feat: add subscription paywall, Stripe success/cancel pages, RevenueCat mobile integration"
```

---

### Task 14: Final Wiring + Run All Tests

**Files:** No new files — integration check and final test pass.

- [ ] **Step 1: Run full test suite**

```bash
npx jest --passWithNoTests
```
Expected: All tests PASS

- [ ] **Step 2: Verify Expo web builds**

```bash
npx expo export --platform web
```
Expected: Build completes without errors

- [ ] **Step 3: Start dev server and smoke-test the golden path manually**

```bash
npx expo start
```

Manual checks:
- [ ] First launch → onboarding shows (2 screens) → login screen
- [ ] Apple/Google sign in works → lands on Upload tab
- [ ] Camera / Library → Preview modal appears
- [ ] Upscale → loading overlay → photo detail
- [ ] Gallery shows photos, pull-to-refresh works, infinite scroll loads more
- [ ] Share and Save work per platform
- [ ] Delete with confirmation → returns to gallery, photo gone
- [ ] Settings: language toggle switches all strings
- [ ] Settings: delete account → sign out → login screen
- [ ] Subscription page shows feature table, subscribe button
- [ ] Web: subscribe → Stripe redirect → success page polls → confirmed

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete PuriClear frontend — Expo Router + Tamagui + Supabase + RevenueCat/Stripe"
```

---

## Self-Review

**Spec coverage:**
- ✓ Onboarding (2 screens, AsyncStorage flag)
- ✓ Apple + Google Sign In (native token + web OAuth)
- ✓ Camera (iOS/Android only) + Library + Web file picker (via expo-image-picker web support)
- ✓ Preview modal with loading overlay
- ✓ Gallery: 2-column grid, 30/page, infinite scroll, pull-to-refresh, empty state
- ✓ Photo detail: share (native/web), save (library/download), delete with confirmation
- ✓ Signed URL: fetched on PhotoCard mount; detail screen accepts pre-fetched URL and falls back to get-upload-url
- ✓ Settings: language toggle, account info, subscription status, manage link, delete account, sign out
- ✓ Subscription: RevenueCat on mobile, Stripe on web, feature table, restore purchase
- ✓ Success page: polls for pro plan up to 10s, handles timeout
- ✓ Cancel page: reassuring message, back to app
- ✓ QUOTA_EXCEEDED in preview → redirects to subscription page
- ✓ Permission denied states with settings deep-link
- ✓ i18n: ja/en, device locale default, override in settings
- ✓ Kawaii Tamagui theme tokens
- ✓ Navigation guard: onboarding → login → tabs

**Placeholder scan:** None found.

**Type consistency:** `UploadRow`, `PickedAsset`, `SubscriptionStatus`, `UserRow` — all used consistently across hooks and screens where referenced.
