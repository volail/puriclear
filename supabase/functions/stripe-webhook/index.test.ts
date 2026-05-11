// supabase/functions/stripe-webhook/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handleStripeEvent } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeDb(captured: Record<string, unknown>[]): SupabaseClient {
  return {
    from: () => ({
      upsert: (data: unknown) => { captured.push(data as Record<string, unknown>); return { error: null } },
    }),
  } as unknown as SupabaseClient
}

const PERIOD_END = Math.floor(new Date('2026-06-11').getTime() / 1000)

Deno.test('checkout.session.completed sets plan=pro and stores provider_customer_id', async () => {
  const captured: Record<string, unknown>[] = []
  const event = {
    type: 'checkout.session.completed',
    data: {
      object: {
        metadata: { user_id: 'user-web-1' },
        customer: 'cus_abc123',
        subscription: 'sub_xyz',
      },
    },
  }
  await handleStripeEvent(event, makeDb(captured), async () => ({ current_period_end: PERIOD_END }))
  assertEquals(captured[0].plan, 'pro')
  assertEquals(captured[0].platform, 'web')
  assertEquals(captured[0].provider_customer_id, 'cus_abc123')
})

Deno.test('customer.subscription.deleted sets plan=free', async () => {
  const captured: Record<string, unknown>[] = []
  const event = {
    type: 'customer.subscription.deleted',
    data: { object: { metadata: { user_id: 'user-web-2' }, current_period_end: PERIOD_END } },
  }
  await handleStripeEvent(event, makeDb(captured), async () => null)
  assertEquals(captured[0].plan, 'free')
  assertEquals(captured[0].expires_at, null)
})
