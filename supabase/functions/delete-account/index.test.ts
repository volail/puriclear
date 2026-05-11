import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeReq(confirm: boolean, token = 'tok'): Request {
  return new Request('http://localhost/delete-account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm }),
  })
}

function makeClients(userId: string): { anon: SupabaseClient; service: SupabaseClient } & { _ops: string[] } {
  const ops: string[] = []
  const anon = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  } as unknown as SupabaseClient
  const service = {
    storage: {
      from: (bucket: string) => ({
        list: async (_prefix: string) => ({ data: [{ name: 'file.jpg' }], error: null }),
        remove: async (_paths: string[]) => { ops.push('remove'); return { error: null } },
      }),
    },
    from: () => ({
      delete: () => ({ eq: () => { ops.push('delete'); return { error: null } } }),
    }),
    auth: {
      admin: { deleteUser: async (id: string) => { ops.push(`deleteUser:${id}`); return { error: null } } },
    },
  } as unknown as SupabaseClient
  return { anon, service, _ops: ops }
}

Deno.test('returns 400 without confirm flag', async () => {
  const clients = makeClients('u1')
  const res = await handler(makeReq(false), clients)
  assertEquals(res.status, 400)
})

Deno.test('deletes storage, rows, and auth user on confirm', async () => {
  const clients = makeClients('user-del-1')
  const res = await handler(makeReq(true), clients)
  assertEquals(res.status, 200)
  assertEquals(clients._ops.some((o) => o.startsWith('deleteUser')), true)
  assertEquals(clients._ops.filter((o: string) => o === 'remove').length >= 2, true)
})
