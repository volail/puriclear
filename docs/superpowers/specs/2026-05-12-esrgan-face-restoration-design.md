# Two-Pass Upscale Pipeline Design (ESRGAN + Face Restoration)

## Goal

Replace the single `fal-ai/clarity-upscaler` call with a two-pass pipeline: Real-ESRGAN for general upscaling followed by a face restoration model (CodeFormer-based) for face fidelity. Target: group shots with faces that are sharp overall and undistorted on faces.

## Architecture

Single-file change in `supabase/functions/process-image/index.ts`. Only step 9 (the fal.ai call) changes — it becomes two sequential calls. Auth, quota, storage, thumbnail generation, and cleanup are all unchanged.

## Data Flow

1. Upload original to Supabase storage, create signed URL (unchanged)
2. **Call 1 — ESRGAN:** POST to `https://fal.run/fal-ai/esrgan`
   - Body: `{ image_url: <signedUrl>, scale: 2 }`
   - Returns: a result URL on fal.ai CDN (no intermediate download needed)
3. **Call 2 — Face restoration:** POST to `https://fal.run/fal-ai/face-restoration`
   - Body: `{ image_url: <esrganResultUrl> }`
   - Returns: final result URL
4. Download final result → upload to Supabase `upscaled` bucket (unchanged)
5. Generate 400px thumbnail, mark upload done (unchanged)

## Error Handling

| Failure point | Action |
|---|---|
| ESRGAN call fails / times out | Full cleanup (delete storage, release quota), return 500 |
| Face restoration fails / times out | Log warning, fall back to ESRGAN result URL, continue normally |

Graceful face restoration fallback means users still get a sharpened image even if the face pass errors.

## Timeouts

- ESRGAN: `AbortSignal.timeout(90_000)` (90s)
- Face restoration: `AbortSignal.timeout(90_000)` (90s)
- Total budget: up to 180s (same as today's single-call budget)

## Response Shapes

Both models return `{ image: { url: string } }` — same parsing logic as clarity-upscaler.

## No Changes To

- Frontend (no rebuild/redeploy needed)
- Database schema or migrations
- Environment variables
- All other edge functions
