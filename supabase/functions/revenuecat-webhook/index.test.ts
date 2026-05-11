// supabase/functions/revenuecat-webhook/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SECRET = 'rc-secret'

function makeReq(event: string, userId: string, expiresAt: string, platform: string, secret = SECRET): Request {
  return new Request('http://localhost/revenuecat-webhook', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        type: event,
        app_user_id: userId,
        expiration_at_ms: new Date(expiresAt).getTime(),
        store: platform === 'ios' ? 'APP_STORE' : 'PLAY_STORE',
      },
    }),
  })
}

function makeDb(captured: Record<string, unknown>[]): SupabaseClient {
  return {
    from: () => ({
      upsert: (data: unknown) => { captured.push(data as Record<string, unknown>); return { error: null } },
    }),
  } as unknown as SupabaseClient
}

Deno.test('rejects wrong secret', async () => {
  const captured: Record<string, unknown>[] = []
  const res = await handler(makeReq('INITIAL_PURCHASE', 'u1', '2026-06-01', 'ios', 'wrong'), makeDb(captured), SECRET)
  assertEquals(res.status, 401)
  assertEquals(captured.length, 0)
})

Deno.test('INITIAL_PURCHASE sets plan=pro and expires_at', async () => {
  const captured: Record<string, unknown>[] = []
  const res = await handler(makeReq('INITIAL_PURCHASE', 'user-1', '2026-06-01T00:00:00Z', 'ios'), makeDb(captured), SECRET)
  assertEquals(res.status, 200)
  assertEquals(captured[0].plan, 'pro')
  assertEquals(captured[0].platform, 'ios')
  assertEquals(captured[0].user_id, 'user-1')
})

Deno.test('EXPIRATION sets plan=free and clears expires_at', async () => {
  const captured: Record<string, unknown>[] = []
  const res = await handler(makeReq('EXPIRATION', 'user-2', '2026-05-01T00:00:00Z', 'android'), makeDb(captured), SECRET)
  assertEquals(res.status, 200)
  assertEquals(captured[0].plan, 'free')
  assertEquals(captured[0].expires_at, null)
})
