// supabase/functions/create-stripe-checkout-session/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeReq(token = 'tok'): Request {
  return new Request('http://localhost/create-stripe-checkout-session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeClients(existingCustomerId: string | null): { anon: SupabaseClient; service: SupabaseClient } {
  const anon = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-web-1' } }, error: null }) },
  } as unknown as SupabaseClient
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { provider_customer_id: existingCustomerId }, error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
  return { anon, service }
}

Deno.test('returns checkout URL with existing customer', async () => {
  const created: Record<string, unknown>[] = []
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          created.push(params as Record<string, unknown>)
          return { url: 'https://checkout.stripe.com/session123' }
        },
      },
    },
  }
  const res = await handler(makeReq(), makeClients('cus_existing'), stripe as any)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.url, 'https://checkout.stripe.com/session123')
  assertEquals((created[0] as any).customer, 'cus_existing')
})

Deno.test('creates new customer when none exists', async () => {
  const created: Record<string, unknown>[] = []
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          created.push(params as Record<string, unknown>)
          return { url: 'https://checkout.stripe.com/newsession' }
        },
      },
    },
  }
  const res = await handler(makeReq(), makeClients(null), stripe as any)
  assertEquals(res.status, 200)
  assertEquals((created[0] as any).customer, undefined)
})
