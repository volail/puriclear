import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts'
import { requireAuth, errorResponse, jsonResponse } from '../_shared/auth.ts'

type Clients = { anon: SupabaseClient; service: SupabaseClient }

async function deleteStorageFolder(svc: SupabaseClient, bucket: string, prefix: string) {
  const { data: files } = await svc.storage.from(bucket).list(prefix)
  if (files?.length) {
    const paths = files.map((f: { name: string }) => `${prefix}/${f.name}`)
    await svc.storage.from(bucket).remove(paths)
  }
}

export async function handler(req: Request, clients: Clients): Promise<Response> {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const auth = await requireAuth(clients.anon)
  if (auth instanceof Response) return auth
  const userId = auth.id

  let body: { confirm?: boolean }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON') }
  if (!body.confirm) return errorResponse('confirm flag required', 400)

  const svc = clients.service

  await deleteStorageFolder(svc, 'originals', `originals/${userId}`)
  await deleteStorageFolder(svc, 'upscaled', `upscaled/${userId}`)

  // Delete all DB rows — cascade handles uploads, daily_usage, subscription_status, folders
  await svc.from('users').delete().eq('id', userId)

  const { error } = await svc.auth.admin.deleteUser(userId)
  if (error) {
    console.error('delete-account: auth deleteUser failed', error)
    return errorResponse('Failed to delete auth user', 500)
  }

  return jsonResponse({ ok: true })
}

if (import.meta.main) {
  Deno.serve(async (req) =>
    handler(req, { anon: createAnonClient(req), service: createServiceClient() })
  )
}
