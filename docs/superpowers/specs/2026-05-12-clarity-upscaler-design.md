# Clarity Upscaler Integration Design

## Goal

Replace the current `fal-ai/aura-sr` model with `fal-ai/clarity-upscaler` to produce sharper, more detailed output from soft low-resolution input photos.

## Architecture

Single-file change in `supabase/functions/process-image/index.ts`. All surrounding logic (auth, quota, storage, thumbnail generation) is unchanged. Only the fal.ai API call (step 9) is modified.

## fal.ai API

- **Endpoint:** `https://fal.run/fal-ai/clarity-upscaler`
- **Method:** POST
- **Auth:** same `FAL_API_KEY` env var as before
- **Request body:**
  ```json
  {
    "image_url": "<signed URL>",
    "scale": 2,
    "creativity": 0.35,
    "resemblance": 0.6,
    "dynamic": 6
  }
  ```
- **Response:** `{ "image": { "url": "<result URL>" } }` — same shape as aura-sr, no parsing changes needed

## Parameters

| Param | Value | Rationale |
|---|---|---|
| `scale` | `2` | 2× upscale as requested |
| `creativity` | `0.35` | Conservative — adds plausible detail without hallucinating |
| `resemblance` | `0.6` | Balanced — stays faithful to the original structure |
| `dynamic` | `6` | Mild HDR enhancement, good general default |

Parameters are hardcoded for now. Not exposed in UI.

## Latency

Clarity-upscaler runs a diffusion pipeline: typically 30–60s vs. 10–20s for aura-sr. The existing 180s `AbortSignal.timeout` covers this.

## Deployment

Deploy `process-image` edge function only. No frontend changes, no migrations.
