import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function createAnonClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization')
  const headers: Record<string, string> = authHeader ? { Authorization: authHeader } : {}
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers } },
  )
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}
