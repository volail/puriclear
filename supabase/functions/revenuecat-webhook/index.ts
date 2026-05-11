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
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function handler(
  req: Request,
  supabase: SupabaseClient,
  webhookSecret: string,
): Promise<Response> {
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!secretsMatch(auth, webhookSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const event: RCEvent = body.event
  const userId = event.app_user_id
  const platform = event.store === 'APP_STORE' ? 'ios' : 'android'
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null

  let update: Record<string, unknown>

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      update = { user_id: userId, plan: 'pro', expires_at: expiresAt, platform, updated_at: new Date().toISOString() }
      break
    case 'CANCELLATION':
      // stays pro until expires_at
      update = { user_id: userId, expires_at: expiresAt, updated_at: new Date().toISOString() }
      break
    case 'EXPIRATION':
    case 'BILLING_ISSUE':
      update = { user_id: userId, plan: 'free', expires_at: null, updated_at: new Date().toISOString() }
      break
    default:
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 })
  }

  const { error } = await supabase.from('subscription_status').upsert(update)
  if (error) {
    console.error('revenuecat-webhook: upsert failed', error)
    return new Response(JSON.stringify({ error: 'db error' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

if (import.meta.main) {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  if (!secret) throw new Error('REVENUECAT_WEBHOOK_SECRET is required')
  Deno.serve((req) => handler(req, createServiceClient(), secret))
}
