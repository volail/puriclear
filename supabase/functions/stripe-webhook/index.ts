// supabase/functions/stripe-webhook/index.ts
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'

type StripeEventLike = { type: string; data: { object: Record<string, unknown> } }
type SubFetcher = (subId: string) => Promise<{ current_period_end: number } | null>

export async function handleStripeEvent(
  event: StripeEventLike,
  supabase: SupabaseClient,
  fetchSub: SubFetcher,
): Promise<void> {
  const obj = event.data.object
  const updatedAt = new Date().toISOString()

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = (obj.metadata as any)?.user_id
      if (!userId) break
      const customerId = obj.customer as string
      const subId = obj.subscription as string | undefined
      const sub = subId ? await fetchSub(subId) : null
      const expiresAt = sub ? new Date(sub.current_period_end * 1000).toISOString() : null
      const { error } = await supabase.from('subscription_status').upsert({
        user_id: userId, plan: 'pro', platform: 'web',
        provider_customer_id: customerId, expires_at: expiresAt,
        updated_at: updatedAt,
      })
      if (error) throw new Error(`subscription_status upsert failed: ${error.message}`)
      break
    }
    case 'invoice.payment_succeeded': {
      const userId = (obj.metadata as any)?.user_id
        ?? (obj as any).subscription_details?.metadata?.user_id
      if (!userId) break
      const subId = obj.subscription as string | undefined
      const sub = subId ? await fetchSub(subId) : null
      const expiresAt = sub ? new Date(sub.current_period_end * 1000).toISOString() : null
      const { error } = await supabase.from('subscription_status').upsert({
        user_id: userId, plan: 'pro', platform: 'web',
        expires_at: expiresAt, updated_at: updatedAt,
      })
      if (error) throw new Error(`subscription_status upsert failed: ${error.message}`)
      break
    }
    case 'customer.subscription.updated': {
      const userId = (obj.metadata as any)?.user_id
      if (!userId) break
      const subId = obj.id as string
      const sub = await fetchSub(subId)
      const expiresAt = sub ? new Date(sub.current_period_end * 1000).toISOString() : null
      const { error } = await supabase.from('subscription_status').upsert({
        user_id: userId, expires_at: expiresAt, updated_at: updatedAt,
      })
      if (error) throw new Error(`subscription_status upsert failed: ${error.message}`)
      break
    }
    case 'customer.subscription.deleted': {
      const userId = (obj.metadata as any)?.user_id
      if (!userId) break
      const { error } = await supabase.from('subscription_status').upsert({
        user_id: userId, plan: 'free', expires_at: null, updated_at: updatedAt,
      })
      if (error) throw new Error(`subscription_status upsert failed: ${error.message}`)
      break
    }
    // other event types are silently ignored
  }
}

if (import.meta.main) {
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!stripeSecret) throw new Error('STRIPE_SECRET_KEY is required')
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is required')

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-04-10' })

  Deno.serve(async (req) => {
    const sig = req.headers.get('stripe-signature')
    if (!sig) return new Response('Missing stripe-signature', { status: 400 })

    const body = await req.text()
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } catch {
      return new Response('Invalid signature', { status: 400 })
    }

    const supabase = createServiceClient()
    try {
      await handleStripeEvent(
        event as unknown as StripeEventLike,
        supabase,
        (subId) => stripe.subscriptions.retrieve(subId) as any,
      )
    } catch (err) {
      console.error('stripe-webhook: handler failed', err)
      return new Response(JSON.stringify({ error: 'internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}
