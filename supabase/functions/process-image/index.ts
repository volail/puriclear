// supabase/functions/process-image/index.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts'
import { requireAuth, errorResponse, jsonResponse } from '../_shared/auth.ts'
import { todayJST } from '../_shared/jst.ts'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])
const MAX_BYTES = 20 * 1024 * 1024

type Clients = { anon: SupabaseClient; service: SupabaseClient }

export async function handler(
  req: Request,
  clients: Clients,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  // 1. Auth
  const auth = await requireAuth(clients.anon)
  if (auth instanceof Response) return auth
  const userId = auth.id

  // 2. Validate input
  let body: { imageBase64?: string; mimeType?: string }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON') }

  const { imageBase64, mimeType } = body
  if (!imageBase64 || !mimeType) return errorResponse('imageBase64 and mimeType required')
  if (!ALLOWED_TYPES.has(mimeType)) return errorResponse('UNSUPPORTED_IMAGE_TYPE')

  let imageBytes: Uint8Array
  try {
    imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))
  } catch {
    return errorResponse('Invalid base64 image data')
  }
  if (imageBytes.length > MAX_BYTES) return errorResponse('IMAGE_TOO_LARGE')

  const svc = clients.service

  // 3. Load subscription status
  let { data: sub, error: subErr } = await svc
    .from('subscription_status')
    .select('plan, expires_at, monthly_count, monthly_reset_date')
    .eq('user_id', userId)
    .single()

  if (subErr || !sub) {
    await svc.from('subscription_status').insert({
      user_id: userId,
      plan: 'free',
      monthly_count: 0,
      monthly_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    })
    sub = { plan: 'free', expires_at: null, monthly_count: 0, monthly_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }
  }

  // 4. Downgrade expired pro
  let plan: 'free' | 'pro' = sub.plan
  if (plan === 'pro' && sub.expires_at && new Date(sub.expires_at) < new Date()) {
    plan = 'free'
    await svc.from('subscription_status').update({ plan: 'free', expires_at: null }).eq('user_id', userId)
  }

  // 5. Reserve quota
  let quotaReserved = false
  if (plan === 'free') {
    const { data: allowed } = await svc.rpc('check_and_increment_free_quota', {
      p_user_id: userId, p_jst_date: todayJST(),
    })
    if (!allowed) {
      return errorResponse('QUOTA_EXCEEDED', 429)
    }
    quotaReserved = true
  } else {
    let monthlyCount = sub.monthly_count
    const resetDate = sub.monthly_reset_date ? new Date(sub.monthly_reset_date) : new Date()
    if (new Date() > resetDate) {
      const next = new Date(resetDate)
      while (next < new Date()) next.setMonth(next.getMonth() + 1)
      monthlyCount = 0
      await svc.from('subscription_status')
        .update({ monthly_count: 0, monthly_reset_date: next.toISOString().slice(0, 10) })
        .eq('user_id', userId)
    }
    if (monthlyCount >= 1000) {
      return errorResponse('QUOTA_EXCEEDED', 429)
    }
    await svc.from('subscription_status').update({ monthly_count: monthlyCount + 1 }).eq('user_id', userId)
    quotaReserved = true
  }

  const EXT_MAP: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
  }
  const ext = EXT_MAP[mimeType] ?? 'jpg'
  const uploadId = crypto.randomUUID()
  // Object paths within each bucket (no bucket-name prefix)
  const originalObjPath = `${userId}/${uploadId}/original.${ext}`
  // Logical paths stored in DB (prefixed with bucket name so getSignedUrl can route them)
  const originalPath = `originals/${originalObjPath}`

  // 6. Upload original
  const { error: origErr } = await svc.storage.from('originals').upload(originalObjPath, imageBytes, { contentType: mimeType })
  if (origErr) {
    await releaseQuota(svc, plan, userId, quotaReserved)
    return errorResponse('Failed to upload original', 500)
  }

  // 7. Insert upload row as pending
  const { data: row, error: rowErr } = await svc
    .from('uploads')
    .insert({ id: uploadId, user_id: userId, original_path: originalPath, status: 'pending' })
    .select('id')
    .single()
  if (rowErr || !row) {
    await svc.storage.from('originals').remove([originalObjPath])
    await releaseQuota(svc, plan, userId, quotaReserved)
    return errorResponse('Failed to create upload record', 500)
  }

  // 8. Signed URL for fal.ai to fetch the original
  const { data: signed } = await svc.storage.from('originals').createSignedUrl(originalObjPath, 300)
  if (!signed?.signedUrl) {
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse('Failed to sign original URL', 500)
  }

  // 9. Call fal.ai aura-sr
  const falRes = await fetchFn('https://fal.run/fal-ai/aura-sr', {
    method: 'POST',
    headers: {
      Authorization: `Key ${Deno.env.get('FAL_API_KEY') ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_url: signed.signedUrl, upscaling_factor: 4, overlapping_tiles: true }),
    signal: AbortSignal.timeout(60000),
  })
  if (!falRes.ok) {
    const falErr = await falRes.text().catch(() => '(unreadable)')
    console.error('[process-image] fal.ai error', falRes.status, falErr)
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse(`AI processing failed: ${falRes.status} ${falErr}`, 500)
  }

  const falData = await falRes.json()
  const resultUrl: string = falData.image?.url ?? falData.images?.[0]?.url
  if (!resultUrl) {
    console.error('[process-image] unexpected fal.ai response shape', JSON.stringify(falData))
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse('AI returned no image', 500)
  }

  // 10. Fetch result and upload to upscaled bucket
  const resultRes = await fetchFn(resultUrl)
  if (!resultRes.ok) {
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse('Failed to fetch AI result', 500)
  }
  const resultBytes = new Uint8Array(await resultRes.arrayBuffer())
  const upscaledObjPath = `${userId}/${uploadId}/upscaled.jpg`
  const upscaledPath = `upscaled/${upscaledObjPath}`

  const { error: upErr } = await svc.storage.from('upscaled').upload(upscaledObjPath, resultBytes, { contentType: 'image/jpeg' })
  if (upErr) {
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse('Failed to store upscaled image', 500)
  }

  // 11. Mark done, delete original
  await svc.from('uploads').update({ status: 'done', upscaled_path: upscaledPath }).eq('id', uploadId)
  await svc.storage.from('originals').remove([originalObjPath])

  // 12. Return signed URL
  const { data: outSigned } = await svc.storage.from('upscaled').createSignedUrl(upscaledObjPath, 3600)
  if (!outSigned?.signedUrl) {
    return errorResponse('Failed to generate download URL', 500)
  }
  return jsonResponse({ uploadId, signedUrl: outSigned.signedUrl })
}

async function releaseQuota(svc: SupabaseClient, plan: string, userId: string, reserved: boolean) {
  if (!reserved) return
  if (plan === 'free') {
    await svc.rpc('decrement_free_quota', { p_user_id: userId, p_jst_date: todayJST() })
  } else {
    await svc.rpc('decrement_pro_quota', { p_user_id: userId })
  }
}

async function failCleanup(
  svc: SupabaseClient, uploadId: string, originalPath: string,
  plan: string, userId: string, quotaReserved: boolean,
) {
  await svc.from('uploads').update({ status: 'failed' }).eq('id', uploadId)
  await svc.storage.from('originals').remove([originalPath])
  await releaseQuota(svc, plan, userId, quotaReserved)
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    try {
      return await handler(req, { anon: createAnonClient(req), service: createServiceClient() })
    } catch (e) {
      console.error('[process-image] unhandled exception', e)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  })
}
