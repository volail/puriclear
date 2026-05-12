# ESRGAN + Face Restoration Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `fal-ai/clarity-upscaler` call with a two-pass pipeline: Real-ESRGAN for general upscaling, then face restoration for face fidelity, with graceful fallback to the ESRGAN result if face restoration fails.

**Architecture:** Only `supabase/functions/process-image/index.ts` changes. Step 9 (one fal.ai call) becomes two sequential calls (9a ESRGAN, 9b face restoration). Everything else — auth, quota, storage, thumbnail, cleanup — is unchanged. Tests run with `npx deno test --allow-env` from `supabase/functions/process-image/`.

**Tech Stack:** Deno edge function, fal.ai REST API (`fal-ai/esrgan`, `fal-ai/face-restoration`).

---

### Task 1: Update tests for two-pass pipeline

**Files:**
- Modify: `supabase/functions/process-image/index.test.ts`

The current `makeFetch` helper only takes `success` and `capturedUrls`. We need a `failUrls` parameter to simulate face restoration failing. We also replace the old "calls clarity-upscaler endpoint" test with two new tests.

- [ ] **Step 1: Update `makeFetch` to support selective URL failures**

Replace the existing `makeFetch` function (lines 77–89) with:

```ts
function makeFetch(success = true, capturedUrls: string[] = [], failUrls: string[] = []): typeof fetch {
  return async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    capturedUrls.push(url)
    const shouldFail = !success || failUrls.some(f => url.includes(f))
    return {
      ok: !shouldFail,
      status: shouldFail ? 500 : 200,
      arrayBuffer: async () => new ArrayBuffer(100),
      json: async () => ({ image: { url: 'https://fal.ai/result.jpg' } }),
      text: async () => shouldFail ? 'error body' : 'ok',
    } as Response
  }
}
```

- [ ] **Step 2: Replace the old endpoint test with two new failing tests**

Remove the test named `'calls clarity-upscaler endpoint'` (lines 131–138) and replace with:

```ts
Deno.test('calls esrgan then face-restoration endpoints in order', async () => {
  const calledUrls: string[] = []
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(true, calledUrls))
  assertEquals(res.status, 200)
  const falCalls = calledUrls.filter(u => u.includes('fal.run'))
  assertEquals(falCalls[0], 'https://fal.run/fal-ai/esrgan')
  assertEquals(falCalls[1], 'https://fal.run/fal-ai/face-restoration')
})

Deno.test('falls back to esrgan result when face restoration fails', async () => {
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(true, [], ['face-restoration']))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(typeof body.signedUrl, 'string')
})
```

- [ ] **Step 3: Run tests — expect 5 pass, 2 fail**

```
cd c:\Users\Bs_Vo\Code\scratch2\supabase\functions\process-image && npx deno test --allow-env index.test.ts
```

Expected: the two new tests fail (implementation still calls clarity-upscaler), all others pass.
Failure messages will contain "clarity-upscaler" vs "esrgan" mismatch — that's correct.

Do NOT commit yet.

---

### Task 2: Implement the two-pass pipeline

**Files:**
- Modify: `supabase/functions/process-image/index.ts:131–160`

Replace the entire current step 9 block (from `// 9. Call fal.ai clarity-upscaler` through the closing `}` of the `if (!resultUrl)` check) with the two-pass version below.

- [ ] **Step 1: Replace step 9 in `index.ts`**

Find and replace this block (lines 131–160):

```ts
  // 9. Call fal.ai clarity-upscaler
  let falRes: Response
  try {
    falRes = await fetchFn('https://fal.run/fal-ai/clarity-upscaler', {
      method: 'POST',
      headers: {
        Authorization: `Key ${Deno.env.get('FAL_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: signed.signedUrl, scale: 2, creativity: 0.2, resemblance: 0.75, dynamic: 6, negative_prompt: 'distorted face, deformed features' }),
      signal: AbortSignal.timeout(180000),
    })
  } catch (e) {
    await failCleanup(svc, uploadId, originalObjPath, plan, userId, quotaReserved)
    return errorResponse(`AI processing timed out or failed: ${e}`, 500)
  }
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
```

With:

```ts
  // 9a. Call fal.ai ESRGAN (general upscale)
  let esrganRes: Response
  try {
    esrganRes = await fetchFn('https://fal.run/fal-ai/esrgan', {
      method: 'POST',
      headers: {
        Authorization: `Key ${Deno.env.get('FAL_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: signed.signedUrl, scale: 2 }),
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
```

- [ ] **Step 2: Run all tests — expect all 7 to pass**

```
cd c:\Users\Bs_Vo\Code\scratch2\supabase\functions\process-image && npx deno test --allow-env index.test.ts
```

Expected output:
```
rejects unauthenticated request ... ok
rejects unsupported mime type ... ok
returns 429 when free quota exceeded ... ok
returns signed URL on success for free user ... ok
returns 500 when fal.ai fails ... ok
calls esrgan then face-restoration endpoints in order ... ok
falls back to esrgan result when face restoration fails ... ok
ok | 7 passed | 0 failed
```

- [ ] **Step 3: Commit both files**

```bash
cd c:\Users\Bs_Vo\Code\scratch2
git add supabase/functions/process-image/index.ts supabase/functions/process-image/index.test.ts
git commit -m "feat: switch to esrgan + face-restoration two-pass pipeline"
```

---

### Task 3: Deploy

**Files:** No file changes — deploy only.

- [ ] **Step 1: Deploy the edge function**

```
cd c:\Users\Bs_Vo\Code\scratch2 && npx supabase functions deploy process-image --no-verify-jwt
```

Expected output:
```
Deployed Functions on project zxvelrjrogearuovdamc: process-image
```

- [ ] **Step 2: Smoke test**

Upload a group photo via the app. Processing will take ~30–50s (two sequential fal.ai calls). Faces should be sharp and undistorted; general image should be crisp.
