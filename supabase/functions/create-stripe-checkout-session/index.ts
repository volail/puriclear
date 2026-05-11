// supabase/functions/create-stripe-checkout-session/index.ts
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts'
import { requireAuth, errorResponse, jsonResponse } from '../_shared/auth.ts'

type Clients = { anon: SupabaseClient; service: SupabaseClient }

export async function handler(
  req: Request,
  clients: Clients,
  stripeClient: Stripe,
): Promise<Response> {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const auth = await requireAuth(clients.anon)
  if (auth instanceof Response) return auth
  const userId = auth.id

  const { data: sub } = await clients.service
    .from('subscription_status')
    .select('provider_customer_id')
    .eq('user_id', userId)
    .single()

  const existingCustomerId = sub?.provider_customer_id ?? null

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID') ?? '', quantity: 1 }],
    success_url: 'https://puriclear.vercel.app/subscription/success',
    cancel_url: 'https://puriclear.vercel.app/subscription/cancel',
    metadata: { user_id: userId },
  }
  if (existingCustomerId) sessionParams.customer = existingCustomerId

  let session: { url: string | null }
  try {
    session = await stripeClient.checkout.sessions.create(sessionParams)
  } catch (err) {
    console.error('create-stripe-checkout-session: Stripe error', err)
    return errorResponse('Failed to create checkout session', 500)
  }

  if (!session.url) return errorResponse('Checkout session has no URL', 500)
  return jsonResponse({ url: session.url })
}

if (import.meta.main) {
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
  const priceId = Deno.env.get('STRIPE_PRICE_ID')
  if (!stripeSecret) throw new Error('STRIPE_SECRET_KEY is required')
  if (!priceId) throw new Error('STRIPE_PRICE_ID is required')
  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-04-10' })
  Deno.serve(async (req) =>
    handler(req, { anon: createAnonClient(req), service: createServiceClient() }, stripe)
  )
}
