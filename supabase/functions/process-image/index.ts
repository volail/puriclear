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
  const originalObjPath = `${userId}/${uploadId}/original.${ext}`
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

  // 9a. Call fal.ai ESRGAN (general upscale)
  let esrganRes: Response
  try {
    esrganRes = await fetchFn('https://fal.run/fal-ai/esrgan', {
      method: 'POST',
      headers: {
        Authorization: `Key ${Deno.env.get('FAL_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: signed.signedUrl, scale: 2, model: 'RealESRGAN_x2plus', face: true, output_format: 'jpeg' }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse(`AI processing timed out or failed: ${e}`, 500)
  }
  if (!esrganRes.ok) {
    const esrganErr = await esrganRes.text().catch(() => '(unreadable)')
    console.error('[process-image] esrgan error', esrganRes.status, esrganErr)
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse(`AI processing failed: ${esrganRes.status} ${esrganErr}`, 500)
  }

  const esrganData = await esrganRes.json()
  let resultUrl: string = esrganData.image?.url ?? esrganData.images?.[0]?.url
  if (!resultUrl) {
    console.error('[process-image] unexpected esrgan response shape', JSON.stringify(esrganData))
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse('AI returned no image', 500)
  }

  // 9b. Call fal.ai face restoration (graceful fallback to esrgan result on failure)
  try {
    const faceRes = await fetchFn('https://fal.run/fal-ai/face-restoration', {
      method: 'POST',
      headers: {
        Authorization: `Key ${Deno.env.get('FAL_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: resultUrl }),
      signal: AbortSignal.timeout(90_000),
    })
    if (faceRes.ok) {
      const faceData = await faceRes.json()
      const faceUrl: string = faceData.image?.url ?? faceData.images?.[0]?.url
      if (faceUrl) resultUrl = faceUrl
      else console.warn('[process-image] face restoration returned no image url, using esrgan result')
    } else {
      console.warn('[process-image] face restoration failed', faceRes.status, await faceRes.text().catch(() => '(unreadable)'))
    }
  } catch (e) {
    console.warn('[process-image] face restoration timed out or threw, using esrgan result', e)
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

  // 11. Generate 20px thumbnail using SDK transform (encodes resize in the signed token)
  let thumbnailPath: string | null = null
  try {
    const { data: thumbSigned } = await svc.storage.from('upscaled').createSignedUrl(
      upscaledObjPath, 60, { transform: { width: 400, resize: 'contain' } }
    )
    if (thumbSigned?.signedUrl) {
      const thumbRes = await fetchFn(thumbSigned.signedUrl, { signal: AbortSignal.timeout(15000) })
      if (thumbRes.ok) {
        const thumbBytes = new Uint8Array(await thumbRes.arrayBuffer())
        const thumbObjPath = `${userId}/${uploadId}/thumb.jpg`
        const { error: thumbErr } = await svc.storage.from('upscaled').upload(thumbObjPath, thumbBytes, { contentType: 'image/jpeg' })
        if (!thumbErr) thumbnailPath = `upscaled/${thumbObjPath}`
        else console.error('[process-image] thumbnail upload failed', thumbErr)
      } else {
        console.error('[process-image] thumbnail fetch', thumbRes.status, await thumbRes.text().catch(() => ''))
      }
    }
  } catch (e) {
    console.error('[process-image] thumbnail generation failed', e)
  }

  // 12. Mark done, delete original
  await svc.from('uploads').update({ status: 'done', upscaled_path: upscaledPath, thumbnail_path: thumbnailPath }).eq('id', uploadId)
  await svc.storage.from('originals').remove([originalObjPath])

  // 13. Return signed URL
  const { data: outSigned } = await svc.storage.from('upscaled').createSignedUrl(upscaledObjPath, 3600)
  if (!outSigned?.signedUrl) {
    return errorResponse('Failed to generate download URL', 500)
  }
  return jsonResponse({ uploadId, signedUrl: outSigned.signedUrl, thumbnailPath })
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
