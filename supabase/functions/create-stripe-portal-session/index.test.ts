import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeReq(): Request {
  return new Request('http://localhost/create-stripe-portal-session', {
    method: 'POST',
    headers: { Authorization: 'Bearer tok' },
  })
}

function makeClients(customerId: string | null): { anon: SupabaseClient; service: SupabaseClient } {
  const anon = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  } as unknown as SupabaseClient
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { provider_customer_id: customerId }, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
  return { anon, service }
}

Deno.test('returns 400 when no provider_customer_id exists', async () => {
  const stripe = { billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/x' }) } } }
  const res = await handler(makeReq(), makeClients(null), stripe as any)
  assertEquals(res.status, 400)
})

Deno.test('returns portal URL when customer exists', async () => {
  const stripe = { billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/portal1' }) } } }
  const res = await handler(makeReq(), makeClients('cus_abc'), stripe as any)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.url, 'https://billing.stripe.com/portal1')
})
