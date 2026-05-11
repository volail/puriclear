import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'

export async function handler(
  req: Request,
  supabase: SupabaseClient,
  webhookSecret: string,
): Promise<Response> {
  if (req.headers.get('x-webhook-secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const userId: string | undefined = body?.record?.id
  if (!userId) {
    return new Response(JSON.stringify({ error: 'missing record.id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error: ue } = await supabase.from('users').insert({ id: userId, locale: 'ja' })
  if (ue && ue.code !== '23505') {
    console.error('provision-user: users insert failed', ue)
    return new Response(JSON.stringify({ error: 'user insert failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error: se } = await supabase.from('subscription_status').insert({ user_id: userId, plan: 'free' })
  if (se && se.code !== '23505') {
    console.error('provision-user: subscription insert failed', se)
    return new Response(JSON.stringify({ error: 'subscription insert failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

if (import.meta.main) {
  Deno.serve((req) =>
    handler(req, createServiceClient(), Deno.env.get('PROVISION_USER_WEBHOOK_SECRET')!)
  )
}
