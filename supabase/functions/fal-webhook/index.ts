// supabase/functions/fal-webhook/index.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'
import { todayJST } from '../_shared/jst.ts'

export async function handler(req: Request, svc: SupabaseClient, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const url = new URL(req.url)
  const uploadId = url.searchParams.get('uploadId')
  const userId = url.searchParams.get('userId')
  const secret = url.searchParams.get('secret')
  const expectedSecret = Deno.env.get('FAL_WEBHOOK_SECRET') ?? ''

  if (!uploadId || !userId || secret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Idempotency guard
  const { data: existing } = await svc.from('uploads').select('status').eq('id', uploadId).single()
  if (existing?.status === 'done') return new Response('OK', { status: 200 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  console.log('[fal-webhook] received status:', body.status, 'for upload:', uploadId)

  // fal.ai sends the result payload directly to webhooks (not wrapped in { status, payload })
  // but defensively support both shapes
  const payload = (body.payload as Record<string, unknown>) ?? body
  const resultUrl: string | undefined =
    (payload.image as any)?.url ?? (payload.images as any[])?.[0]?.url

  const isFailed = body.status === 'FAILED' || body.error || !resultUrl

  if (isFailed) {
    console.error('[fal-webhook] job failed for upload', uploadId, JSON.stringify(body).slice(0, 500))
    await svc.from('uploads').update({ status: 'failed' }).eq('id', uploadId)
    await releaseQuota(svc, userId)
    return new Response('OK', { status: 200 })
  }

  // Fetch the upscaled result from fal.ai CDN
  let resultBytes: Uint8Array
  try {
    const resultRes = await fetchFn(resultUrl!, { signal: AbortSignal.timeout(60000) })
    if (!resultRes.ok) throw new Error(`HTTP ${resultRes.status}`)
    resultBytes = new Uint8Array(await resultRes.arrayBuffer())
  } catch (e) {
    console.error('[fal-webhook] failed to fetch result image', e)
    await svc.from('uploads').update({ status: 'failed' }).eq('id', uploadId)
    await releaseQuota(svc, userId)
    return new Response('OK', { status: 200 })
  }

  const upscaledObjPath = `${userId}/${uploadId}/upscaled.jpg`
  const upscaledPath = `upscaled/${upscaledObjPath}`

  const { error: upErr } = await svc.storage
    .from('upscaled')
    .upload(upscaledObjPath, resultBytes, { contentType: 'image/jpeg' })
  if (upErr) {
    console.error('[fal-webhook] failed to upload upscaled image', upErr)
    await svc.from('uploads').update({ status: 'failed' }).eq('id', uploadId)
    await releaseQuota(svc, userId)
    return new Response('OK', { status: 200 })
  }

  // Generate 400px thumbnail via Supabase render endpoint
  let thumbnailPath: string | null = null
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const { data: thumbSigned } = await svc.storage.from('upscaled').createSignedUrl(upscaledObjPath, 60)
    if (thumbSigned?.signedUrl) {
      const token = new URL(thumbSigned.signedUrl).searchParams.get('token')
      const renderUrl = `${supabaseUrl}/storage/v1/render/image/sign/upscaled/${upscaledObjPath}?token=${token}&width=400&resize=contain`
      const thumbRes = await fetchFn(renderUrl, { signal: AbortSignal.timeout(15000) })
      if (thumbRes.ok) {
        const thumbBytes = new Uint8Array(await thumbRes.arrayBuffer())
        const thumbObjPath = `${userId}/${uploadId}/thumb.jpg`
        const { error: thumbErr } = await svc.storage
          .from('upscaled')
          .upload(thumbObjPath, thumbBytes, { contentType: 'image/jpeg' })
        if (!thumbErr) thumbnailPath = `upscaled/${thumbObjPath}`
        else console.error('[fal-webhook] thumbnail upload failed', thumbErr)
      } else {
        console.error('[fal-webhook] render endpoint', thumbRes.status, await thumbRes.text().catch(() => ''))
      }
    }
  } catch (e) {
    console.error('[fal-webhook] thumbnail generation failed', e)
  }

  // Fetch original_path for deletion
  const { data: uploadRow } = await svc
    .from('uploads')
    .select('original_path')
    .eq('id', uploadId)
    .single()

  await svc.from('uploads')
    .update({ status: 'done', upscaled_path: upscaledPath, thumbnail_path: thumbnailPath })
    .eq('id', uploadId)

  if (uploadRow?.original_path) {
    const origObjPath = uploadRow.original_path.startsWith('originals/')
      ? uploadRow.original_path.slice('originals/'.length)
      : uploadRow.original_path
    await svc.storage.from('originals').remove([origObjPath])
  }

  console.log('[fal-webhook] completed upload', uploadId, 'thumbnail:', thumbnailPath)
  return new Response('OK', { status: 200 })
}

async function releaseQuota(svc: SupabaseClient, userId: string) {
  const { data: sub } = await svc
    .from('subscription_status')
    .select('plan')
    .eq('user_id', userId)
    .single()
  if (!sub) return
  if (sub.plan === 'free') {
    await svc.rpc('decrement_free_quota', { p_user_id: userId, p_jst_date: todayJST() })
  } else {
    await svc.rpc('decrement_pro_quota', { p_user_id: userId })
  }
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    try {
      return await handler(req, createServiceClient())
    } catch (e) {
      console.error('[fal-webhook] unhandled exception', e)
      return new Response('Internal server error', { status: 500 })
    }
  })
}
