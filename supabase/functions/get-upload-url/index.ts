import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts'
import { requireAuth, errorResponse, jsonResponse } from '../_shared/auth.ts'

type Clients = { anon: SupabaseClient; service: SupabaseClient }

export async function handler(req: Request, clients: Clients): Promise<Response> {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const auth = await requireAuth(clients.anon)
  if (auth instanceof Response) return auth
  const userId = auth.id

  const uploadId = new URL(req.url).searchParams.get('uploadId')
  if (!uploadId) return errorResponse('uploadId required')

  const { data, error } = await clients.service
    .from('uploads')
    .select('upscaled_path')
    .eq('id', uploadId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return errorResponse('Upload not found', 404)
  if (!data.upscaled_path) return errorResponse('Upload not ready', 400)

  const { data: signed, error: signErr } = await clients.service.storage
    .from('upscaled')
    .createSignedUrl(data.upscaled_path, 3600)

  if (signErr || !signed?.signedUrl) return errorResponse('Failed to generate URL', 500)
  return jsonResponse({ signedUrl: signed.signedUrl })
}

if (import.meta.main) {
  Deno.serve(async (req) =>
    handler(req, { anon: createAnonClient(req), service: createServiceClient() })
  )
}
