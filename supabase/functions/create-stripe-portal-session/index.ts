import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts'
import { requireAuth, errorResponse, jsonResponse } from '../_shared/auth.ts'

type Clients = { anon: SupabaseClient; service: SupabaseClient }

export async function handler(req: Request, clients: Clients, stripeClient: Stripe): Promise<Response> {
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

  const customerId = sub?.provider_customer_id
  if (!customerId) return errorResponse('No active web subscription found', 400)

  let session: { url: string | null }
  try {
    session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://puriclear.vercel.app/settings',
    })
  } catch (err) {
    console.error('create-stripe-portal-session: Stripe error', err)
    return errorResponse('Failed to create portal session', 500)
  }

  if (!session.url) return errorResponse('Portal session has no URL', 500)
  return jsonResponse({ url: session.url })
}

if (import.meta.main) {
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeSecret) throw new Error('STRIPE_SECRET_KEY is required')
  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-04-10' })
  Deno.serve(async (req) =>
    handler(req, { anon: createAnonClient(req), service: createServiceClient() }, stripe)
  )
}
