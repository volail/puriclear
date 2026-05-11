import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'

const SECRET = 'test-secret'

function makeReq(userId: string, secret = SECRET): Request {
  return new Request('http://localhost/provision-user', {
    method: 'POST',
    headers: { 'x-webhook-secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'INSERT', record: { id: userId } }),
  })
}

Deno.test('rejects wrong webhook secret', async () => {
  const inserted: string[] = []
  const db = { from: (t: string) => ({ insert: () => { inserted.push(t); return { error: null } } }) }
  const res = await handler(makeReq('u1', 'bad'), db as any, SECRET)
  assertEquals(res.status, 401)
  assertEquals(inserted.length, 0)
})

Deno.test('inserts users and subscription_status rows', async () => {
  const inserted: string[] = []
  const db = { from: (t: string) => ({ insert: () => { inserted.push(t); return { error: null } } }) }
  const res = await handler(makeReq('user-abc'), db as any, SECRET)
  assertEquals(res.status, 200)
  assertEquals(inserted, ['users', 'subscription_status'])
})

Deno.test('is idempotent — ignores duplicate key errors', async () => {
  const db = { from: () => ({ insert: () => ({ error: { code: '23505' } }) }) }
  const res = await handler(makeReq('user-abc'), db as any, SECRET)
  assertEquals(res.status, 200)
})
