import { timingSafeEqual } from 'https://deno.land/std@0.208.0/crypto/timing_safe_equal.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'
import { errorResponse, jsonResponse } from '../_shared/auth.ts'

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
  if (!secretsMatch(req.headers.get('x-webhook-secret') ?? '', webhookSecret)) {
    return errorResponse('Unauthorized', 401)
  }

  let body: unknown
  try { body = await req.json() } catch { return errorResponse('Invalid JSON') }

  const userId: unknown = (body as any)?.record?.id
  if (!userId || typeof userId !== 'string') {
    return errorResponse('missing or invalid record.id')
  }

  const { error: ue } = await supabase.from('users').insert({ id: userId, locale: 'ja' })
  if (ue && ue.code !== '23505') {
    console.error('provision-user: users insert failed', ue)
    return errorResponse('user insert failed', 500)
  }

  const { error: se } = await supabase.from('subscription_status').insert({ user_id: userId, plan: 'free' })
  if (se && se.code !== '23505') {
    console.error('provision-user: subscription insert failed', se)
    return errorResponse('subscription insert failed', 500)
  }

  return jsonResponse({ ok: true })
}

if (import.meta.main) {
  const secret = Deno.env.get('PROVISION_USER_WEBHOOK_SECRET')
  if (!secret) throw new Error('PROVISION_USER_WEBHOOK_SECRET is required')
  Deno.serve((req) => handler(req, createServiceClient(), secret))
}
