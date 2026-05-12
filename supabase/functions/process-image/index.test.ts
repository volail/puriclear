// supabase/functions/process-image/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Minimal valid 1x1 PNG base64
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function makeReq(imageBase64 = PNG_B64, mimeType = 'image/png', token = 'tok'): Request {
  return new Request('http://localhost/process-image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType }),
  })
}

function makeClients(opts: {
  userId?: string
  plan?: 'free' | 'pro'
  expiresAt?: string | null
  quotaAllowed?: boolean
  monthlyCount?: number
  monthlyResetDate?: string
}): { anon: SupabaseClient; service: SupabaseClient } {
  const {
    userId = 'user-1',
    plan = 'free',
    expiresAt = null,
    quotaAllowed = true,
    monthlyCount = 0,
    monthlyResetDate = '2099-01-01',
  } = opts

  const anonDb = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  } as unknown as SupabaseClient

  const serviceDb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (table === 'subscription_status') {
              return {
                data: { plan, expires_at: expiresAt, monthly_count: monthlyCount, monthly_reset_date: monthlyResetDate },
                error: null,
              }
            }
            return { data: null, error: null }
          },
        }),
      }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: 'upload-id-1' }, error: null }) }),
      }),
      update: () => ({ eq: () => ({ error: null }) }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'some/path' }, error: null }),
        remove: async () => ({ error: null }),
        createSignedUrl: async (_path: string, _exp: number) => ({
          data: { signedUrl: 'https://example.com/signed-url' },
          error: null,
        }),
      }),
    },
    rpc: async (fn: string) => {
      if (fn === 'check_and_increment_free_quota') return { data: quotaAllowed, error: null }
      return { data: null, error: null }
    },
  } as unknown as SupabaseClient

  return { anon: anonDb, service: serviceDb }
}

function makeFetch(success = true, capturedUrls: string[] = [], failUrls: string[] = []): typeof fetch {
  return async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    capturedUrls.push(url)
    const shouldFail = !success || failUrls.some(f => url.includes(f))
    return {
      ok: !shouldFail,
      status: shouldFail ? 500 : 200,
      arrayBuffer: async () => new ArrayBuffer(100),
      json: async () => ({ image: { url: 'https://fal.ai/result.jpg' } }),
      text: async () => shouldFail ? 'error body' : 'ok',
    } as Response
  }
}

Deno.test('rejects unauthenticated request', async () => {
  const anonDb = {
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no user' } }) },
  } as unknown as SupabaseClient
  const serviceDb = {} as SupabaseClient
  const res = await handler(makeReq(), { anon: anonDb, service: serviceDb }, makeFetch())
  assertEquals(res.status, 401)
})

Deno.test('rejects unsupported mime type', async () => {
  const clients = makeClients({})
  const res = await handler(makeReq(PNG_B64, 'image/gif'), clients, makeFetch())
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, 'UNSUPPORTED_IMAGE_TYPE')
})

Deno.test('returns 429 when free quota exceeded', async () => {
  const clients = makeClients({ plan: 'free', quotaAllowed: false })
  const res = await handler(makeReq(), clients, makeFetch())
  assertEquals(res.status, 429)
  const body = await res.json()
  assertEquals(body.error, 'QUOTA_EXCEEDED')
})

Deno.test('returns signed URL on success for free user', async () => {
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(true))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(typeof body.signedUrl, 'string')
  assertEquals(typeof body.uploadId, 'string')
})

Deno.test('returns 500 when fal.ai fails', async () => {
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(false))
  assertEquals(res.status, 500)
})

Deno.test('calls esrgan then face-restoration endpoints in order', async () => {
  const calledUrls: string[] = []
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(true, calledUrls))
  assertEquals(res.status, 200)
  const falCalls = calledUrls.filter(u => u.includes('fal.run'))
  assertEquals(falCalls[0], 'https://fal.run/fal-ai/esrgan')
  assertEquals(falCalls[1], 'https://fal.run/fal-ai/face-restoration')
})

Deno.test('falls back to esrgan result when face restoration fails', async () => {
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(true, [], ['face-restoration']))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(typeof body.signedUrl, 'string')
})
