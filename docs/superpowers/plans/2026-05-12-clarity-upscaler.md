# Clarity Upscaler Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `fal-ai/aura-sr` with `fal-ai/clarity-upscaler` to produce sharper output from soft low-resolution photos.

**Architecture:** Single-file change in `supabase/functions/process-image/index.ts` — swap the fal.ai endpoint URL and request body. The response-parsing code already handles the clarity-upscaler response shape (`image.url`). No frontend changes, no migrations.

**Tech Stack:** Deno (edge function), fal.ai REST API, `npx deno test` for tests, `npx supabase functions deploy` for deployment.

---

### Task 1: Fix test mock + add endpoint assertion

**Files:**
- Modify: `supabase/functions/process-image/index.test.ts`

The existing test "returns 500 when fal.ai fails" has a pre-existing failure because the mock `Response` is missing a `text()` method — the handler calls `falRes.text()` when `falRes.ok` is false. We fix the mock and add a test that asserts the correct fal.ai endpoint is called.

- [ ] **Step 1: Write the failing test for endpoint URL**

Replace the `makeFetch` helper and add a new test in `supabase/functions/process-image/index.test.ts`:

```ts
// Replace the existing makeFetch function with this version that captures the called URL:
function makeFetch(success = true, capturedUrls: string[] = []): typeof fetch {
  return async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    capturedUrls.push(url)
    return {
      ok: success,
      status: success ? 200 : 500,
      arrayBuffer: async () => new ArrayBuffer(100),
      json: async () => ({ image: { url: 'https://fal.ai/result.jpg' } }),
      text: async () => 'fal error body',
    } as Response
  }
}
```

Then add this test at the bottom of the file:

```ts
Deno.test('calls clarity-upscaler endpoint', async () => {
  const calledUrls: string[] = []
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(true, calledUrls))
  assertEquals(res.status, 200)
  const falCall = calledUrls.find(u => u.includes('fal.run'))
  assertEquals(falCall, 'https://fal.run/fal-ai/clarity-upscaler')
})
```

- [ ] **Step 2: Run tests to verify the new test fails and the mock fix resolves the pre-existing failure**

```
cd supabase/functions/process-image && npx deno test --allow-env index.test.ts
```

Expected output:
- "returns 500 when fal.ai fails" → PASS (mock now has `text()`)
- "calls clarity-upscaler endpoint" → FAIL (still calling aura-sr)
- All others → PASS
- Summary: 4 passed | 1 failed

---

### Task 2: Swap to clarity-upscaler in the handler

**Files:**
- Modify: `supabase/functions/process-image/index.ts:134-142`

- [ ] **Step 1: Replace the fal.ai call block**

Find this block (around line 134):

```ts
    falRes = await fetchFn('https://fal.run/fal-ai/aura-sr', {
      method: 'POST',
      headers: {
        Authorization: `Key ${Deno.env.get('FAL_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: signed.signedUrl, upscaling_factor: 2, overlapping_tiles: false }),
      signal: AbortSignal.timeout(180000),
    })
```

Replace it with:

```ts
    falRes = await fetchFn('https://fal.run/fal-ai/clarity-upscaler', {
      method: 'POST',
      headers: {
        Authorization: `Key ${Deno.env.get('FAL_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: signed.signedUrl, scale: 2, creativity: 0.35, resemblance: 0.6, dynamic: 6 }),
      signal: AbortSignal.timeout(180000),
    })
```

- [ ] **Step 2: Run all tests — expect all 5 to pass**

```
cd supabase/functions/process-image && npx deno test --allow-env index.test.ts
```

Expected output:
```
rejects unauthenticated request ... ok
rejects unsupported mime type ... ok
returns 429 when free quota exceeded ... ok
returns signed URL on success for free user ... ok
returns 500 when fal.ai fails ... ok
calls clarity-upscaler endpoint ... ok
ok | 6 passed | 0 failed
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/process-image/index.ts supabase/functions/process-image/index.test.ts
git commit -m "feat: switch fal.ai model to clarity-upscaler for better sharpening"
```

---

### Task 3: Deploy

**Files:** No file changes — deploy only.

- [ ] **Step 1: Deploy the edge function**

```
npx supabase functions deploy process-image --no-verify-jwt
```

Expected output:
```
Deployed Functions on project zxvelrjrogearuovdamc: process-image
```

- [ ] **Step 2: Smoke test**

Upload a soft/low-res photo via the app. The result should appear noticeably sharper than before. Processing time will be 30–60s vs the previous ~10–20s — this is normal.
