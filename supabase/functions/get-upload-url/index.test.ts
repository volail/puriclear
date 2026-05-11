import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeReq(uploadId: string, token = 'tok'): Request {
  return new Request(`http://localhost/get-upload-url?uploadId=${uploadId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeClients(ownsUpload: boolean, upscaledPath: string | null): { anon: SupabaseClient; service: SupabaseClient } {
  const anon = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  } as unknown as SupabaseClient
  const service = {
    from: () => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          eq: (_col2: string, _val2: string) => ({
            single: async () => ownsUpload
              ? { data: { upscaled_path: upscaledPath }, error: null }
              : { data: null, error: { code: 'PGRST116' } },
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: 'https://example.com/fresh' }, error: null }),
      }),
    },
  } as unknown as SupabaseClient
  return { anon, service }
}

Deno.test('returns 404 when upload does not belong to user', async () => {
  const res = await handler(makeReq('upload-999'), makeClients(false, null))
  assertEquals(res.status, 404)
})

Deno.test('returns 400 when upload is not done yet', async () => {
  const res = await handler(makeReq('upload-pending'), makeClients(true, null))
  assertEquals(res.status, 400)
})

Deno.test('returns fresh signed URL', async () => {
  const res = await handler(makeReq('upload-done'), makeClients(true, 'upscaled/u/id/upscaled.jpg'))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.signedUrl, 'https://example.com/fresh')
})
