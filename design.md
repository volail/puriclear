# PuriClear - App Design Document

## Overview

PuriClear is an AI-powered purikura photo enhancer. Users photograph or import low-resolution purikura strips, and the app upscales them 4x using AI, then stores the results in a personal cloud album.

**Target market:** Japan (Japanese + English localization)  
**Target audience:** Primarily young women / kawaii aesthetic

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo (React Native + TypeScript) |
| Navigation | Expo Router |
| UI | Tamagui |
| Backend / DB | Supabase (Postgres + Storage + Edge Functions) |
| AI Processing | fal.ai - `fal-ai/aura-sr` (4x upscale + noise removal) |
| Auth | Supabase Auth (Apple Sign In, Google Sign In) |
| Payments (iOS/Android) | RevenueCat |
| Payments (Web) | Stripe Checkout |
| Web Hosting | Vercel |
| Localization | expo-localization + i18next |
| Device APIs | expo-image-picker, expo-sharing, expo-media-library |

---

## Navigation Structure

```
app/
  (auth)/
    _layout.tsx
    onboarding.tsx       -> 2-screen explainer (first launch only)
    login.tsx            -> Apple / Google sign in
  (tabs)/
    _layout.tsx          -> bottom tab bar
    index.tsx            -> camera / upload screen         (tab 1)
    gallery/
      index.tsx          -> photo grid                     (tab 2)
      [id].tsx           -> photo detail - share / delete
    settings.tsx         -> account, language, delete      (tab 3)
  preview.tsx            -> photo preview modal before upscaling
  subscription.tsx       -> paywall (pushed on quota exceeded)
  subscription/
    success.tsx          -> Stripe success polling page (web only)
    cancel.tsx           -> Stripe cancel page (web only)
  +not-found.tsx
```

### Launch Sequence

1. **Every launch** - Splash screen (branding)
2. **First launch only** - Onboarding (2 screens explaining the app), flagged by `AsyncStorage` key `hasSeenOnboarding`
3. -> Login screen (if not authenticated)
4. -> Main app (tab navigator)

---

## Screens

### Splash Screen
- Shown on every launch, before any navigation decision
- PuriClear logo + app name centered on cream white background
- Duration: ~2 seconds, then transitions to onboarding (first launch) or login / main app

### Onboarding (first launch only)

**Screen 1 - What the app does**
- Side-by-side visual: blurry purikura on the left -> crisp 4x version on the right, with an arrow between them
- App name at top
- Tagline (bilingual): 「小さなプリクラ、きれいに」 / "Make your purikura beautiful"
- "Next ->" button

**Screen 2 - Cloud album & sharing**
- Icon or illustration of a photo album / cloud
- Headline: 「プリクラを、いつでもどこでも」 / "Your purikura, always with you"
- Body: all upscaled photos are saved to a private cloud album; share to LINE, Instagram, and more - anytime
- "Get started ->" button -> navigates to login

### Login
- PuriClear logo at top
- "Sign in with Apple" button
- "Sign in with Google" button
- Soft pink / lavender background consistent with overall theme

### Camera / Upload Screen (Tab 1)
- Two primary actions centered on screen: "Take photo" (camera icon) and "Import from library" (photo icon)
- On photo selected -> navigate to **Preview screen**

**Preview Screen (modal)**
- Full-width display of the selected photo
- "Cancel" button (top left or bottom)
- "✨ Upscale" confirm button (bottom, prominent)
- Tapping Upscale -> show fullscreen loading overlay ("AIが処理中... / Processing...") -> on success navigate to photo detail of the result

### Gallery (Tab 2)
- 2-column grid of upscaled photos, sorted most recent first, rounded cards

**Empty state**
- Kawaii illustration (e.g. a sparkle star or cute camera)
- Message: 「まだプリクラがありません」 / "No purikura yet!"
- CTA button: "+ Upscale your first one" -> navigates to camera/upload screen (Tab 1)

### Photo Detail
- Full-screen photo view
- Share button -> native share sheet (LINE, Instagram, save to camera roll, etc.)
- Save button -> writes the upscaled image to the device photo library via `expo-media-library` after requesting permission
- Delete button -> confirmation dialog -> delete from storage + DB -> navigate back to gallery

### Subscription Page
Feature comparison layout:

|  | Free | Pro |
|---|---|---|
| Upscales | 3 / day | 1,000 / month |
| Cloud album | ✓ | ✓ |
| Share anywhere | ✓ | ✓ |

- Price displayed clearly: ¥980 / month
- Subscribe button (triggers RevenueCat paywall on iOS/Android, or Stripe Checkout redirect on web)
- Small "Restore purchase" link below (required by App Store)

**Subscription success page (web only - `/subscription/success`)**
- "Processing your subscription..." spinner shown on mount while polling
- On `plan = 'pro'` confirmed: "You're all set! ✨" message + "Start upscaling ->" button back to main app
- On poll timeout: "Payment received - please restart the app to activate Pro"

**Subscription cancel page (web only - `/subscription/cancel`)**
- User landed here by pressing "Back" or "Cancel" during Stripe Checkout - no charge was made
- Message: "No worries! You're still on the free plan (3 upscales/day)."
- Single CTA button: "Back to app" -> navigates to camera/upload screen (Tab 1)

### Settings (Tab 3)
- Language: toggle Japanese / English
- Account: display email + sign-in provider (Apple / Google)
- **Subscription status:** show current plan (Free / Pro). For Pro users, show renewal date (`expires_at`) and a "Manage subscription" link - on iOS/Android this deep-links to the system subscription management screen; on web it opens the Stripe customer portal.
- Links: Privacy Policy, Terms of Service, Support / Contact
- Sign out
- Delete account (red, bottom of list) -> confirmation dialog explaining all photos will be deleted -> deletes account + photos -> returns to login

---

## Features

### Authentication
- Apple Sign In
- Google Sign In
- On first successful auth, create the matching `users` row and a default `subscription_status` row with `plan = 'free'`. This is handled by a **Supabase Database Webhook** on `INSERT` to `auth.users` that calls a `provision-user` Edge Function - so provisioning happens server-side regardless of which client or platform the user signs up from.
- Guest mode: deferred to a future version

### Camera / Upload Screen (Tab 1)
- **iOS / Android:** Launch camera to photograph a purikura print, or import from photo library via `expo-image-picker`
- **Web:** File picker only (no camera access)
- Supported input formats: JPEG, PNG, HEIC/HEIF on iOS/Android. Web accepts JPEG and PNG only.
- Max input size: 20 MB. Client should downscale/compress larger images before upload when possible; server rejects oversized files with `IMAGE_TOO_LARGE`.
- Permission denied states: if camera or photo library permission is denied, show a friendly explanation and a button to open system settings.
- App permission strings must be localized for Japanese and English for camera, photo library read, and photo library save access.
- On image selection, navigate to **Preview screen**
- On Preview, tapping "Upscale" calls the `process-image` Edge Function
- Show a loading state while AI processes (synchronous, no async queue)
- On success -> navigate to the resulting photo detail view
- On failure -> show error message, allow user to try again manually (no automatic retry)

### AI Processing
- Model: `fal-ai/aura-sr`
- Upscale factor: 4x
- Noise removal: enabled
- Output format: JPEG unless fal.ai returns another supported image format; store the actual extension in `upscaled_path`.
- Called exclusively server-side (Edge Function) - API key never exposed to client

### Gallery (Tab 2)
- 2-column grid of upscaled photos, sorted by most recent
- All photos in a single default album ("アップスケール済みプリクラ" / "Upscaled Purikura")
- **Future:** user-created folders/albums (schema is folder-ready now, UI deferred)
- Pagination: load 30 photos at a time with infinite scroll / pull-to-refresh.
- Tap a photo -> detail view

### Photo Detail
- Full-screen photo view
- **Share:** native share sheet via `expo-sharing` - user picks LINE, Instagram, etc.
- **Save:** save to camera roll via `expo-media-library`; if permission is denied, show the permission-denied state.
- **Delete:** confirmation dialog -> delete from Supabase Storage + remove DB row

### Subscription (980 yen/month)
- **Free tier:** 3 uploads per day, resets at midnight JST
- **Pro tier:** up to 1,000 uploads per month (server-enforced), resets on monthly anniversary
- On the 4th upload attempt (free user) -> redirect to `subscription.tsx`

#### Paywall by Platform
| Platform | Flow |
|---|---|
| iOS / Android | RevenueCat native paywall sheet |
| Web | Stripe Checkout redirect -> return URL -> webhook |

Both platforms write subscription state to the same `subscription_status` table in Supabase.

**Stripe web return URLs:**
- Success: `https://puriclear.vercel.app/subscription/success`
- Cancel: `https://puriclear.vercel.app/subscription/cancel`

**Post-Stripe redirect (web):** The `/subscription/success` page re-fetches `subscription_status` from Supabase on mount. Because the Stripe webhook may not have fired yet, it polls every 2 seconds for up to 10 seconds. Once `plan = 'pro'` is confirmed, it navigates back to the main camera/upload screen. If polling times out, it shows a "payment received, please restart the app" message.

**Subscription identity mapping:** Stripe checkout sessions and RevenueCat customer records must include the Supabase `user_id` as metadata / app user ID so webhooks can update the correct `subscription_status` row.

**Cancellation / expiry behavior:** A cancellation keeps `plan = 'pro'` until `expires_at`; once expired, the webhook or next server-side subscription check downgrades the user to `free`.

### Settings (Tab 3)
- Language toggle (Japanese / English)
- Account info (email / provider)
- Subscription status: show current plan (Free / Pro). For Pro users, show renewal date (`expires_at`) and a "Manage subscription" link.
- Links to Privacy Policy, Terms of Service, and Support / Contact
- Delete account (required by App Store) - deletes account + all stored photos
- Sign out

---

## Supabase Schema

```sql
-- Mirrors auth.users; stores app-level user preferences
users (
  id          uuid primary key references auth.users,
  locale      text default 'ja',   -- 'ja' | 'en'
  created_at  timestamptz default now()
)

-- One row per uploaded photo
uploads (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references users(id) on delete cascade,
  folder_id      uuid references folders(id) on delete set null,  -- nullable, future use
  original_path  text not null,    -- Supabase Storage path; may point to a deleted object after successful upscaling
  upscaled_path  text,             -- Supabase Storage path, null while processing
  status         text default 'pending',  -- 'pending' | 'done' | 'failed'
  created_at     timestamptz default now()
)

-- Daily free-tier usage counter
daily_usage (
  user_id  uuid references users(id) on delete cascade,
  date     date not null,           -- JST date (YYYY-MM-DD)
  count    int default 0,
  primary key (user_id, date)
)

-- Subscription state (synced from RevenueCat + Stripe webhooks)
subscription_status (
  user_id            uuid primary key references users(id) on delete cascade,
  plan               text default 'free',   -- 'free' | 'pro'
  platform           text,                  -- 'ios' | 'android' | 'web'
  provider_customer_id text,                 -- Stripe customer ID or RevenueCat app user/customer ID
  monthly_count      int default 0,
  monthly_reset_date date,
  expires_at         timestamptz,
  updated_at         timestamptz default now()
)

-- Future: user-created albums
folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
)
```

Migration note: create `folders` before `uploads`, or add the `uploads.folder_id` foreign key after both tables exist.

### Storage Buckets
| Bucket | Access |
|---|---|
| `originals` | Private |
| `upscaled` | Private (served via short-lived signed URLs) |

Storage path convention:
- Originals: `originals/{user_id}/{upload_id}/original.{ext}`
- Upscaled: `upscaled/{user_id}/{upload_id}/upscaled.{ext}`
- Signed URL lifetime: 1 hour. Gallery/detail screens should refresh expired URLs on demand.

### Row Level Security
- Enable RLS on `users`, `uploads`, `daily_usage`, `subscription_status`, and `folders`.
- Users may select/update only their own `users` preference row.
- Users may select only their own `uploads`, `folders`, `daily_usage`, and `subscription_status` rows.
- Direct client inserts/updates/deletes to `uploads`, `daily_usage`, and `subscription_status` are blocked; Edge Functions or DB triggers perform those writes with privileged access after verifying the user JWT.
- Storage buckets remain private. Clients do not write directly to `originals` or `upscaled`; uploads and deletes go through Edge Functions.

---

## Edge Functions

### `provision-user`
- Triggered by a Supabase Database Webhook on `INSERT` to `auth.users`.
- Inserts a `users` row (`id`, `locale = 'ja'`) and a `subscription_status` row (`plan = 'free'`) for the new user.
- Idempotent: uses `INSERT ... ON CONFLICT DO NOTHING` so re-triggers are safe.

### `process-image`
1. Verify JWT - reject if unauthenticated
2. Validate file type and size - reject with `UNSUPPORTED_IMAGE_TYPE` or `IMAGE_TOO_LARGE` before calling fal.ai
3. Read `subscription_status` for user; if missing, create a default free row
4. If `expires_at` is in the past, downgrade expired Pro users to `free` before quota checks
5. Reserve quota before calling fal.ai using a transaction / RPC with row locking so parallel upload attempts cannot exceed the limit. If processing later fails, release the reservation.
6. **Free user:** query `daily_usage` for today (JST date) - reject with `QUOTA_EXCEEDED` if `count >= 3`; otherwise increment `count` as the reservation.
7. **Pro user:** if `monthly_reset_date` has passed, reset `monthly_count` to 0 and advance `monthly_reset_date` to the next monthly anniversary date. Then reject with `QUOTA_EXCEEDED` if `monthly_count >= 1000`; otherwise increment `monthly_count` as the reservation.
8. Upload original image to `originals/` bucket
9. Insert `uploads` row with `status = 'pending'`
10. Call `fal-ai/aura-sr` (4x, noise removal enabled) with a 60-second server timeout
11. Upload result to `upscaled/` bucket
12. Update `uploads` row: `status = 'done'`, set `upscaled_path`; delete original from `originals/` bucket (originals are not retained after successful upscaling)
13. Keep the quota reservation as consumed usage.
14. Return a 1-hour signed URL of the upscaled image

On fal.ai error, timeout, upload/storage failure, or any other failure after quota reservation -> update `uploads` row to `status = 'failed'` if it exists, release the quota reservation, and return error to client. Original is retained in `originals/` bucket when available for debugging/retry.

### `revenuecat-webhook`
Verifies the RevenueCat webhook signature before processing. Extracts `app_user_id` (= Supabase `user_id`) from the event. Upserts `subscription_status` per event type:

| Event | `plan` | `expires_at` | `platform` |
|---|---|---|---|
| `INITIAL_PURCHASE`, `RENEWAL` | `'pro'` | subscription period end date | `'ios'` or `'android'` |
| `CANCELLATION` | unchanged (stays `'pro'`) | set to current period end date | unchanged |
| `EXPIRATION`, `BILLING_ISSUE` | `'free'` | `null` | unchanged |

### `stripe-webhook`
Verifies the Stripe webhook signature (`stripe-signature` header) before processing. Extracts `user_id` from the session/subscription metadata. Upserts `subscription_status` per event type:

| Event | `plan` | `expires_at` | `platform` |
|---|---|---|---|
| `checkout.session.completed` | `'pro'` | subscription period end date | `'web'` | also write `provider_customer_id = session.customer` |
| `invoice.payment_succeeded` (renewal) | `'pro'` | new period end date | `'web'` |
| `customer.subscription.updated` (cancel at period end) | unchanged | current period end date | unchanged |
| `customer.subscription.deleted` | `'free'` | `null` | unchanged |

### `create-stripe-checkout-session`
- Verify JWT.
- Create a Stripe Checkout session with `mode = 'subscription'`, the 980 JPY monthly price ID, `success_url` and `cancel_url` set to the Vercel return URLs, and `metadata.user_id = supabaseUserId`.
- Return the Checkout session URL; client redirects to it.

### `create-stripe-portal-session`
- Verify JWT.
- Look up `subscription_status.provider_customer_id` for the user (the Stripe customer ID stored when the subscription was created).
- Create a Stripe customer portal session and return the portal URL for web "Manage subscription".

### `get-upload-url`
- Verify JWT.
- Confirm the requested `upload_id` belongs to the authenticated user.
- Return a fresh 1-hour signed URL for the `upscaled_path`.

### `delete-account`
- Verify JWT and require an explicit confirmation flag from the client.
- Delete all user storage objects under `originals/{user_id}/` and `upscaled/{user_id}/`.
- Delete app rows through cascading DB deletes.
- Delete the Supabase Auth user with the service role.
- Return success, then client signs out and returns to login.

---

## Quota Logic Summary

| User type | Daily / Monthly limit | Reset |
|---|---|---|
| Free | 3 uploads / day | Midnight JST |
| Pro | 1,000 uploads / month | Monthly anniversary date |

Quota is consumed only after a successful upscale. Failed AI calls do not increment usage.

Implementation detail: `process-image` may reserve quota before AI processing to prevent parallel overuse, but it must release that reservation on failure so failed AI calls do not reduce the user's allowance.

JST offset: UTC+9. Edge Function computes today's JST date as:
```ts
const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
```

---

## UI / Design Direction

- **Palette:** soft pink `#FFB7C5`, lavender `#C8B4E8`, cream white `#FFF9FB`, light grey `#F2EEF5`
- **Corners:** rounded everywhere - `borderRadius: "$6"` or higher in Tamagui
- **Typography:** playful but readable - medium/semibold weights, generous line height
- **Gallery:** 2-column grid, rounded cards, subtle drop shadow
- **Tab icons:** outline when inactive, filled + tinted when active
- **Overall feel:** kawaii - soft, warm, feminine, approachable

---

## Localization

- Default locale: device locale, fallback to Japanese (`ja`)
- Supported: `ja`, `en`
- All user-facing strings via `i18next` with namespaced JSON files
- Language can be overridden in Settings

---

## Legal / Support

- Settings includes links to Privacy Policy, Terms of Service, and Support / Contact.
- Privacy Policy must explain photo upload, AI processing via fal.ai, cloud storage, account deletion, and subscription billing.
- Terms must cover subscription renewal/cancellation and acceptable uploaded content.

---

## Error Handling (v1)

| Scenario | Behavior |
|---|---|
| AI processing fails | Show error toast/dialog, let user retry manually |
| Quota exceeded | Redirect to subscription page |
| Network error | Show error message |
| Auth failure | Redirect to login |
| Permission denied | Explain why access is needed and offer a button to open system settings |
| Unsupported image type | Show supported formats |
| Image too large | Ask user to choose a smaller image or let the app compress it |
| Signed URL expired | Silently request a fresh signed URL and retry image display once |
| Payment canceled | Return to subscription page without changing plan |
| Payment webhook delayed | Keep polling on success page, then show the restart / refresh message if still unconfirmed |
| Account deletion | Delete all photos + user record, sign out, return to login |

Automatic retry logic: deferred to a future version.

---

## Out of Scope (v1)

- Guest mode
- User-created folders / albums (schema ready, UI deferred)
- Push notifications
- Async processing queue
- Automatic retry on AI failure
- Batch upscaling (multiple photos at once)
- In-app photo editing / filters

