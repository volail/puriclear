// supabase/functions/revenuecat-webhook/index.ts
import { timingSafeEqual } from 'https://deno.land/std@0.208.0/crypto/timing_safe_equal.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'

type RCEvent = {
  type: string
  app_user_id: string
  expiration_at_ms?: number
  store?: string
}

function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  const maxLen = Math.max(ab.length, bb.length)
  const paddedA = new Uint8Array(maxLen)
  const paddedB = new Uint8Array(maxLen)
  paddedA.set(ab)
  paddedB.set(bb)
  // always run timingSafeEqual (constant time), then also check length equality
  const contentOk = timingSafeEqual(paddedA, paddedB)
  return ab.length === bb.length && contentOk
}

export async function handler(
  req: Request,
  supabase: SupabaseClient,
  webhookSecret: string,
): Promise<Response> {
  const rawAuth = req.headers.get('Authorization') ?? ''
  const auth = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth
  if (!secretsMatch(auth, webhookSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }
  const event = (body as any)?.event
  if (!event?.type || !event?.app_user_id) {
    return new Response(JSON.stringify({ error: 'Invalid webhook payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const userId = event.app_user_id
  const platform = event.store === 'APP_STORE' ? 'ios' : 'android'
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null

  let update: Record<string, unknown>

  const updatedAt = new Date().toISOString()

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      update = { user_id: userId, plan: 'pro', expires_at: expiresAt, platform, updated_at: updatedAt }
      break
    case 'CANCELLATION':
      // stays pro until expires_at
      update = { user_id: userId, expires_at: expiresAt, updated_at: updatedAt }
      break
    case 'EXPIRATION':
    case 'BILLING_ISSUE':
      update = { user_id: userId, plan: 'free', expires_at: null, updated_at: updatedAt }
      break
    default:
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const { error } = await supabase.from('subscription_status').upsert(update)
  if (error) {
    console.error('revenuecat-webhook: upsert failed', error)
    return new Response(JSON.stringify({ error: 'db error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

if (import.meta.main) {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  if (!secret) throw new Error('REVENUECAT_WEBHOOK_SECRET is required')
  Deno.serve((req) => handler(req, createServiceClient(), secret))
}
