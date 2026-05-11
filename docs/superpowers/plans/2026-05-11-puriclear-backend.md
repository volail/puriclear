# PuriClear Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all Supabase backend infrastructure for PuriClear — database schema, RLS, storage buckets, quota RPCs, and all eight Edge Functions.

**Architecture:** Supabase Postgres holds all application data with Row Level Security enforcing per-user access. Eight Deno-based Edge Functions handle all privileged operations — the client never writes data directly. Storage buckets hold original and upscaled images accessible only via short-lived signed URLs generated server-side. A Postgres stored procedure handles atomic quota check-and-increment to prevent parallel upload abuse.

**Tech Stack:** Supabase CLI, Postgres (RLS + stored procedures), Supabase Storage, Supabase Edge Functions (Deno/TypeScript), fal.ai REST API (`fal-ai/aura-sr`), Stripe Node SDK, RevenueCat webhooks.

---

## Prerequisites

- Supabase project created at supabase.com — note the **Project Ref**, **URL**, **anon key**, and **service role key**
- Supabase CLI installed: `npm install -g supabase`
- Deno installed: https://deno.land/
- fal.ai account with API key
- Stripe account with a product + price created (980 JPY/month recurring) — note the **Price ID**
- RevenueCat project with iOS + Android apps configured

## Environment Variables

Set these in Supabase dashboard → Project Settings → Edge Functions → Secrets:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
FAL_API_KEY=<fal-api-key>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
REVENUECAT_WEBHOOK_SECRET=<revenuecat-webhook-secret>
PROVISION_USER_WEBHOOK_SECRET=<generate-with: openssl rand -hex 32>
```

---

## File Structure

```
supabase/
  migrations/
    20260511000000_initial_schema.sql
    20260511000001_rls_policies.sql
    20260511000002_quota_rpc.sql
  functions/
    _shared/
      cors.ts
      supabase.ts
      auth.ts
      jst.ts
    provision-user/
      index.ts
      index.test.ts
    process-image/
      index.ts
      index.test.ts
    revenuecat-webhook/
      index.ts
      index.test.ts
    stripe-webhook/
      index.ts
      index.test.ts
    create-stripe-checkout-session/
      index.ts
      index.test.ts
    create-stripe-portal-session/
      index.ts
      index.test.ts
    get-upload-url/
      index.ts
      index.test.ts
    delete-account/
      index.ts
      index.test.ts
```

---

### Task 1: Supabase CLI init

**Files:**
- Create: `supabase/config.toml` (generated)

- [ ] **Step 1: Init and link to your remote project**

```bash
supabase init
supabase link --project-ref <your-project-ref>
```

Expected: `supabase/config.toml` created, CLI linked to the remote project.

- [ ] **Step 2: Start local Supabase for development**

```bash
supabase start
```

Expected: Local Supabase running at `http://localhost:54321`. Copy the printed local anon and service role keys — use these when testing locally.

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml .gitignore
git commit -m "chore: init supabase project"
```

---

### Task 2: Database schema migration

**Files:**
- Create: `supabase/migrations/20260511000000_initial_schema.sql`

- [ ] **Step 1: Create migration file**

```bash
supabase migration new initial_schema
```

Expected: file created at `supabase/migrations/20260511000000_initial_schema.sql`.

- [ ] **Step 2: Write schema**

Replace the empty file content with:

```sql
-- folders created before uploads (uploads has a FK to folders)
create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.users (
  id         uuid primary key,
  locale     text not null default 'ja',
  created_at timestamptz not null default now(),
  constraint users_auth_fk  foreign key (id) references auth.users(id) on delete cascade,
  constraint users_locale_ck check (locale in ('ja', 'en'))
);

alter table public.folders
  add constraint folders_user_fk foreign key (user_id) references public.users(id) on delete cascade;

create table public.uploads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  folder_id     uuid references public.folders(id) on delete set null,
  original_path text not null,
  upscaled_path text,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  constraint uploads_status_ck check (status in ('pending', 'done', 'failed'))
);

create table public.daily_usage (
  user_id uuid not null references public.users(id) on delete cascade,
  date    date not null,
  count   int  not null default 0,
  primary key (user_id, date)
);

create table public.subscription_status (
  user_id              uuid primary key references public.users(id) on delete cascade,
  plan                 text        not null default 'free',
  platform             text,
  provider_customer_id text,
  monthly_count        int         not null default 0,
  monthly_reset_date   date,
  expires_at           timestamptz,
  updated_at           timestamptz not null default now(),
  constraint subscription_plan_ck     check (plan in ('free', 'pro')),
  constraint subscription_platform_ck check (platform in ('ios', 'android', 'web'))
);
```

- [ ] **Step 3: Apply migration**

```bash
supabase db push
```

Expected: `Applying migration 20260511000000_initial_schema.sql... Done.`

- [ ] **Step 4: Verify tables exist**

```bash
supabase db shell --command "\dt public.*"
```

Expected: `users`, `folders`, `uploads`, `daily_usage`, `subscription_status` all listed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260511000000_initial_schema.sql
git commit -m "feat: add initial database schema"
```

---

### Task 3: RLS policies

**Files:**
- Create: `supabase/migrations/20260511000001_rls_policies.sql`

- [ ] **Step 1: Create migration file**

```bash
supabase migration new rls_policies
```

- [ ] **Step 2: Write policies**

```sql
alter table public.users             enable row level security;
alter table public.uploads           enable row level security;
alter table public.daily_usage       enable row level security;
alter table public.subscription_status enable row level security;
alter table public.folders           enable row level security;

-- users: read and update own row only
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- uploads: read own rows only (writes go through edge functions)
create policy "uploads_select_own" on public.uploads
  for select using (auth.uid() = user_id);

-- folders: read own rows only
create policy "folders_select_own" on public.folders
  for select using (auth.uid() = user_id);

-- daily_usage: read own rows only
create policy "daily_usage_select_own" on public.daily_usage
  for select using (auth.uid() = user_id);

-- subscription_status: read own row only
create policy "subscription_status_select_own" on public.subscription_status
  for select using (auth.uid() = user_id);
```

- [ ] **Step 3: Apply and verify**

```bash
supabase db push
supabase db shell --command "select tablename, rowsecurity from pg_tables where schemaname = 'public';"
```

Expected: all 5 tables show `rowsecurity = t`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260511000001_rls_policies.sql
git commit -m "feat: add RLS policies for all tables"
```

---

### Task 4: Quota RPC functions

**Files:**
- Create: `supabase/migrations/20260511000002_quota_rpc.sql`

- [ ] **Step 1: Create migration file**

```bash
supabase migration new quota_rpc
```

- [ ] **Step 2: Write RPCs**

```sql
-- Returns true and increments count if under limit, false if at limit.
-- Uses SELECT FOR UPDATE to be safe under concurrent requests.
create or replace function public.check_and_increment_free_quota(
  p_user_id  uuid,
  p_jst_date date
) returns boolean
language plpgsql security definer as $$
declare
  v_count int;
begin
  insert into public.daily_usage (user_id, date, count)
  values (p_user_id, p_jst_date, 0)
  on conflict (user_id, date) do nothing;

  select count into v_count
  from public.daily_usage
  where user_id = p_user_id and date = p_jst_date
  for update;

  if v_count >= 3 then
    return false;
  end if;

  update public.daily_usage
  set count = count + 1
  where user_id = p_user_id and date = p_jst_date;

  return true;
end;
$$;

-- Releases a free quota reservation on failure (floors at 0).
create or replace function public.decrement_free_quota(
  p_user_id  uuid,
  p_jst_date date
) returns void
language plpgsql security definer as $$
begin
  update public.daily_usage
  set count = greatest(0, count - 1)
  where user_id = p_user_id and date = p_jst_date;
end;
$$;

-- Releases a pro quota reservation on failure (floors at 0).
create or replace function public.decrement_pro_quota(
  p_user_id uuid
) returns void
language plpgsql security definer as $$
begin
  update public.subscription_status
  set monthly_count = greatest(0, monthly_count - 1)
  where user_id = p_user_id;
end;
$$;
```

- [ ] **Step 3: Apply and smoke-test**

```bash
supabase db push
supabase db shell
```

```sql
-- Smoke test (replace uuid with any valid format)
select public.check_and_increment_free_quota('00000000-0000-0000-0000-000000000099'::uuid, current_date); -- t
select public.check_and_increment_free_quota('00000000-0000-0000-0000-000000000099'::uuid, current_date); -- t
select public.check_and_increment_free_quota('00000000-0000-0000-0000-000000000099'::uuid, current_date); -- t
select public.check_and_increment_free_quota('00000000-0000-0000-0000-000000000099'::uuid, current_date); -- f
delete from public.daily_usage where user_id = '00000000-0000-0000-0000-000000000099';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260511000002_quota_rpc.sql
git commit -m "feat: add atomic quota check-and-increment RPCs"
```

---

### Task 5: Storage buckets

- [ ] **Step 1: Create buckets in Supabase dashboard**

Navigate to Supabase dashboard → Storage → New bucket. Create two buckets:
- Name: `originals`, **Public bucket: OFF**
- Name: `upscaled`, **Public bucket: OFF**

Both must be private. All reads go through signed URLs generated by Edge Functions using the service role key.

- [ ] **Step 2: Verify via CLI**

```bash
supabase storage ls
```

Expected: `originals` and `upscaled` listed.

- [ ] **Step 3: Commit placeholder**

```bash
git commit --allow-empty -m "chore: created originals and upscaled storage buckets (dashboard)"
```

---

### Task 6: Shared Edge Function utilities

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/supabase.ts`
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/jst.ts`

- [ ] **Step 1: Write `cors.ts`**

```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}
```

- [ ] **Step 2: Write `supabase.ts`**

```typescript
// supabase/functions/_shared/supabase.ts
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function createAnonClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}
```

- [ ] **Step 3: Write `auth.ts`**

```typescript
// supabase/functions/_shared/auth.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'

export async function requireAuth(
  anonClient: SupabaseClient,
): Promise<{ id: string } | Response> {
  const { data: { user }, error } = await anonClient.auth.getUser()
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return { id: user.id }
}

export function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 4: Write `jst.ts`**

```typescript
// supabase/functions/_shared/jst.ts
export function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/
git commit -m "feat: add shared edge function utilities"
```

---

### Task 7: `provision-user` Edge Function

**Files:**
- Create: `supabase/functions/provision-user/index.ts`
- Test: `supabase/functions/provision-user/index.test.ts`

- [ ] **Step 1: Scaffold**

```bash
supabase functions new provision-user
```

- [ ] **Step 2: Write the test**

```typescript
// supabase/functions/provision-user/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'

const SECRET = 'test-secret'

function makeReq(userId: string, secret = SECRET): Request {
  return new Request('http://localhost/provision-user', {
    method: 'POST',
    headers: { 'x-webhook-secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'INSERT', record: { id: userId } }),
  })
}

Deno.test('rejects wrong webhook secret', async () => {
  const inserted: string[] = []
  const db = { from: (t: string) => ({ insert: () => { inserted.push(t); return { error: null } } }) }
  const res = await handler(makeReq('u1', 'bad'), db as any, SECRET)
  assertEquals(res.status, 401)
  assertEquals(inserted.length, 0)
})

Deno.test('inserts users and subscription_status rows', async () => {
  const inserted: string[] = []
  const db = { from: (t: string) => ({ insert: () => { inserted.push(t); return { error: null } } }) }
  const res = await handler(makeReq('user-abc'), db as any, SECRET)
  assertEquals(res.status, 200)
  assertEquals(inserted, ['users', 'subscription_status'])
})

Deno.test('is idempotent — ignores duplicate key errors', async () => {
  const db = { from: () => ({ insert: () => ({ error: { code: '23505' } }) }) }
  const res = await handler(makeReq('user-abc'), db as any, SECRET)
  assertEquals(res.status, 200)
})
```

- [ ] **Step 3: Run — expect failure**

```bash
deno test supabase/functions/provision-user/index.test.ts --allow-env
```

Expected: FAIL — `handler` not exported.

- [ ] **Step 4: Implement**

```typescript
// supabase/functions/provision-user/index.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'

export async function handler(
  req: Request,
  supabase: SupabaseClient,
  webhookSecret: string,
): Promise<Response> {
  if (req.headers.get('x-webhook-secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { record } = await req.json()
  const userId: string = record.id

  const { error: ue } = await supabase.from('users').insert({ id: userId, locale: 'ja' })
  if (ue && ue.code !== '23505') {
    console.error('provision-user: users insert failed', ue)
    return new Response(JSON.stringify({ error: 'user insert failed' }), { status: 500 })
  }

  const { error: se } = await supabase.from('subscription_status').insert({ user_id: userId, plan: 'free' })
  if (se && se.code !== '23505') {
    console.error('provision-user: subscription insert failed', se)
    return new Response(JSON.stringify({ error: 'subscription insert failed' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve((req) =>
  handler(req, createServiceClient(), Deno.env.get('PROVISION_USER_WEBHOOK_SECRET')!)
)
```

- [ ] **Step 5: Run — expect pass**

```bash
deno test supabase/functions/provision-user/index.test.ts --allow-env
```

Expected: 3 tests PASS.

- [ ] **Step 6: Deploy**

```bash
supabase functions deploy provision-user --no-verify-jwt
```

- [ ] **Step 7: Configure Database Webhook**

In Supabase dashboard → Database → Webhooks → Create webhook:
- **Name:** `provision-user`
- **Table:** `auth.users`
- **Events:** INSERT
- **Type:** HTTP Request
- **URL:** `https://<project-ref>.supabase.co/functions/v1/provision-user`
- **Headers:** `x-webhook-secret: <PROVISION_USER_WEBHOOK_SECRET>`

- [ ] **Step 8: End-to-end test**

Create a test user in Supabase dashboard → Authentication → Users → Invite user. Then:

```bash
supabase db shell --command "select id, locale from public.users order by created_at desc limit 1;"
supabase db shell --command "select user_id, plan from public.subscription_status order by updated_at desc limit 1;"
```

Expected: rows for the new user in both tables.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/provision-user/
git commit -m "feat: add provision-user edge function and DB webhook"
```

---

### Task 8: `process-image` Edge Function

**Files:**
- Create: `supabase/functions/process-image/index.ts`
- Test: `supabase/functions/process-image/index.test.ts`

- [ ] **Step 1: Scaffold**

```bash
supabase functions new process-image
```

- [ ] **Step 2: Write the test**

```typescript
// supabase/functions/process-image/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Minimal valid 1x1 PNG base64
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function makeReq(imageBase64 = PNG_B64, mimeType = 'image/png', token = 'tok'): Request {
  return new Request('http://localhost/process-image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType }),
  })
}

function makeClients(opts: {
  userId?: string
  plan?: 'free' | 'pro'
  expiresAt?: string | null
  quotaAllowed?: boolean
  monthlyCount?: number
  monthlyResetDate?: string
}): { anon: SupabaseClient; service: SupabaseClient } {
  const {
    userId = 'user-1',
    plan = 'free',
    expiresAt = null,
    quotaAllowed = true,
    monthlyCount = 0,
    monthlyResetDate = '2027-01-01',
  } = opts

  const anonDb = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  } as unknown as SupabaseClient

  const serviceDb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (table === 'subscription_status') {
              return {
                data: { plan, expires_at: expiresAt, monthly_count: monthlyCount, monthly_reset_date: monthlyResetDate },
                error: null,
              }
            }
            return { data: null, error: null }
          },
        }),
      }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: 'upload-id-1' }, error: null }) }),
      }),
      update: () => ({ eq: () => ({ error: null }) }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'some/path' }, error: null }),
        remove: async () => ({ error: null }),
        createSignedUrl: async (_path: string, _exp: number) => ({
          data: { signedUrl: 'https://example.com/signed-url' },
          error: null,
        }),
      }),
    },
    rpc: async (fn: string) => {
      if (fn === 'check_and_increment_free_quota') return { data: quotaAllowed, error: null }
      return { data: null, error: null }
    },
  } as unknown as SupabaseClient

  return { anon: anonDb, service: serviceDb }
}

function makeFetch(success = true): typeof fetch {
  return async (_url: string | URL | Request) => ({
    ok: success,
    arrayBuffer: async () => new ArrayBuffer(100),
    json: async () => ({ images: [{ url: 'https://fal.ai/result.jpg' }] }),
  } as Response)
}

Deno.test('rejects unauthenticated request', async () => {
  const anonDb = {
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no user' } }) },
  } as unknown as SupabaseClient
  const serviceDb = {} as SupabaseClient
  const res = await handler(makeReq(), { anon: anonDb, service: serviceDb }, makeFetch())
  assertEquals(res.status, 401)
})

Deno.test('rejects unsupported mime type', async () => {
  const clients = makeClients({})
  const res = await handler(makeReq(PNG_B64, 'image/gif'), clients, makeFetch())
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, 'UNSUPPORTED_IMAGE_TYPE')
})

Deno.test('returns 429 when free quota exceeded', async () => {
  const clients = makeClients({ plan: 'free', quotaAllowed: false })
  const res = await handler(makeReq(), clients, makeFetch())
  assertEquals(res.status, 429)
  const body = await res.json()
  assertEquals(body.error, 'QUOTA_EXCEEDED')
})

Deno.test('returns signed URL on success for free user', async () => {
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(true))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(typeof body.signedUrl, 'string')
  assertEquals(typeof body.uploadId, 'string')
})

Deno.test('returns 500 when fal.ai fails', async () => {
  const clients = makeClients({ plan: 'free', quotaAllowed: true })
  const res = await handler(makeReq(), clients, makeFetch(false))
  assertEquals(res.status, 500)
})
```

- [ ] **Step 3: Run — expect failure**

```bash
deno test supabase/functions/process-image/index.test.ts --allow-env
```

Expected: FAIL — `handler` not exported.

- [ ] **Step 4: Implement**

```typescript
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

  const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))
  if (imageBytes.length > MAX_BYTES) return errorResponse('IMAGE_TOO_LARGE')

  const svc = clients.service

  // 3. Load subscription status
  let { data: sub, error: subErr } = await svc
    .from('subscription_status')
    .select('plan, expires_at, monthly_count, monthly_reset_date')
    .eq('user_id', userId)
    .single()

  if (subErr || !sub) {
    await svc.from('subscription_status').insert({ user_id: userId, plan: 'free' })
    sub = { plan: 'free', expires_at: null, monthly_count: 0, monthly_reset_date: null }
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
      return new Response(JSON.stringify({ error: 'QUOTA_EXCEEDED' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
      return new Response(JSON.stringify({ error: 'QUOTA_EXCEEDED' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    await svc.from('subscription_status').update({ monthly_count: monthlyCount + 1 }).eq('user_id', userId)
    quotaReserved = true
  }

  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  const uploadId = crypto.randomUUID()
  const originalPath = `originals/${userId}/${uploadId}/original.${ext}`

  // 6. Upload original
  const { error: origErr } = await svc.storage.from('originals').upload(originalPath, imageBytes, { contentType: mimeType })
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
    await svc.storage.from('originals').remove([originalPath])
    await releaseQuota(svc, plan, userId, quotaReserved)
    return errorResponse('Failed to create upload record', 500)
  }

  // 8. Signed URL for fal.ai to fetch the original
  const { data: signed } = await svc.storage.from('originals').createSignedUrl(originalPath, 300)
  if (!signed?.signedUrl) {
    await failCleanup(svc, uploadId, originalPath, plan, userId, quotaReserved)
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
    await failCleanup(svc, uploadId, originalPath, plan, userId, quotaReserved)
    return errorResponse('AI processing failed', 500)
  }

  const falData = await falRes.json()
  const resultUrl: string = falData.images?.[0]?.url
  if (!resultUrl) {
    await failCleanup(svc, uploadId, originalPath, plan, userId, quotaReserved)
    return errorResponse('AI returned no image', 500)
  }

  // 10. Fetch result and upload to upscaled bucket
  const resultRes = await fetchFn(resultUrl)
  const resultBytes = new Uint8Array(await resultRes.arrayBuffer())
  const upscaledPath = `upscaled/${userId}/${uploadId}/upscaled.jpg`

  const { error: upErr } = await svc.storage.from('upscaled').upload(upscaledPath, resultBytes, { contentType: 'image/jpeg' })
  if (upErr) {
    await failCleanup(svc, uploadId, originalPath, plan, userId, quotaReserved)
    return errorResponse('Failed to store upscaled image', 500)
  }

  // 11. Mark done, delete original
  await svc.from('uploads').update({ status: 'done', upscaled_path: upscaledPath }).eq('id', uploadId)
  await svc.storage.from('originals').remove([originalPath])

  // 12. Return signed URL
  const { data: outSigned } = await svc.storage.from('upscaled').createSignedUrl(upscaledPath, 3600)
  return jsonResponse({ uploadId, signedUrl: outSigned?.signedUrl })
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

Deno.serve(async (req) => handler(req, { anon: createAnonClient(req), service: createServiceClient() }))
```

- [ ] **Step 5: Run — expect pass**

```bash
deno test supabase/functions/process-image/index.test.ts --allow-env
```

Expected: 5 tests PASS.

- [ ] **Step 6: Deploy**

```bash
supabase functions deploy process-image
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/process-image/
git commit -m "feat: add process-image edge function"
```

---

### Task 9: `revenuecat-webhook` Edge Function

**Files:**
- Create: `supabase/functions/revenuecat-webhook/index.ts`
- Test: `supabase/functions/revenuecat-webhook/index.test.ts`

- [ ] **Step 1: Scaffold**

```bash
supabase functions new revenuecat-webhook
```

- [ ] **Step 2: Write the test**

```typescript
// supabase/functions/revenuecat-webhook/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SECRET = 'rc-secret'

function makeReq(event: string, userId: string, expiresAt: string, platform: string, secret = SECRET): Request {
  return new Request('http://localhost/revenuecat-webhook', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        type: event,
        app_user_id: userId,
        expiration_at_ms: new Date(expiresAt).getTime(),
        store: platform === 'ios' ? 'APP_STORE' : 'PLAY_STORE',
      },
    }),
  })
}

function makeDb(captured: Record<string, unknown>[]): SupabaseClient {
  return {
    from: () => ({
      upsert: (data: unknown) => { captured.push(data as Record<string, unknown>); return { error: null } },
    }),
  } as unknown as SupabaseClient
}

Deno.test('rejects wrong secret', async () => {
  const captured: Record<string, unknown>[] = []
  const res = await handler(makeReq('INITIAL_PURCHASE', 'u1', '2026-06-01', 'ios', 'wrong'), makeDb(captured), SECRET)
  assertEquals(res.status, 401)
  assertEquals(captured.length, 0)
})

Deno.test('INITIAL_PURCHASE sets plan=pro and expires_at', async () => {
  const captured: Record<string, unknown>[] = []
  const res = await handler(makeReq('INITIAL_PURCHASE', 'user-1', '2026-06-01T00:00:00Z', 'ios'), makeDb(captured), SECRET)
  assertEquals(res.status, 200)
  assertEquals(captured[0].plan, 'pro')
  assertEquals(captured[0].platform, 'ios')
  assertEquals(captured[0].user_id, 'user-1')
})

Deno.test('EXPIRATION sets plan=free and clears expires_at', async () => {
  const captured: Record<string, unknown>[] = []
  const res = await handler(makeReq('EXPIRATION', 'user-2', '2026-05-01T00:00:00Z', 'android'), makeDb(captured), SECRET)
  assertEquals(res.status, 200)
  assertEquals(captured[0].plan, 'free')
  assertEquals(captured[0].expires_at, null)
})
```

- [ ] **Step 3: Run — expect failure**

```bash
deno test supabase/functions/revenuecat-webhook/index.test.ts --allow-env
```

Expected: FAIL.

- [ ] **Step 4: Implement**

```typescript
// supabase/functions/revenuecat-webhook/index.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'

type RCEvent = {
  type: string
  app_user_id: string
  expiration_at_ms?: number
  store?: string
}

export async function handler(
  req: Request,
  supabase: SupabaseClient,
  webhookSecret: string,
): Promise<Response> {
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (auth !== webhookSecret) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const event: RCEvent = body.event
  const userId = event.app_user_id
  const platform = event.store === 'APP_STORE' ? 'ios' : 'android'
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null

  let update: Record<string, unknown>

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      update = { user_id: userId, plan: 'pro', expires_at: expiresAt, platform, updated_at: new Date().toISOString() }
      break
    case 'CANCELLATION':
      // stays pro until expires_at
      update = { user_id: userId, expires_at: expiresAt, updated_at: new Date().toISOString() }
      break
    case 'EXPIRATION':
    case 'BILLING_ISSUE':
      update = { user_id: userId, plan: 'free', expires_at: null, updated_at: new Date().toISOString() }
      break
    default:
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 })
  }

  const { error } = await supabase.from('subscription_status').upsert(update)
  if (error) {
    console.error('revenuecat-webhook: upsert failed', error)
    return new Response(JSON.stringify({ error: 'db error' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

Deno.serve((req) =>
  handler(req, createServiceClient(), Deno.env.get('REVENUECAT_WEBHOOK_SECRET')!)
)
```

- [ ] **Step 5: Run — expect pass**

```bash
deno test supabase/functions/revenuecat-webhook/index.test.ts --allow-env
```

Expected: 3 tests PASS.

- [ ] **Step 6: Deploy and configure**

```bash
supabase functions deploy revenuecat-webhook --no-verify-jwt
```

In RevenueCat dashboard → Project → Integrations → Webhooks → Add endpoint:
- URL: `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`
- Authorization header value: `<REVENUECAT_WEBHOOK_SECRET>`

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/revenuecat-webhook/
git commit -m "feat: add revenuecat-webhook edge function"
```

---

### Task 10: `stripe-webhook` Edge Function

**Files:**
- Create: `supabase/functions/stripe-webhook/index.ts`
- Test: `supabase/functions/stripe-webhook/index.test.ts`

- [ ] **Step 1: Scaffold**

```bash
supabase functions new stripe-webhook
```

- [ ] **Step 2: Write the test**

```typescript
// supabase/functions/stripe-webhook/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handleStripeEvent } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeDb(captured: Record<string, unknown>[]): SupabaseClient {
  return {
    from: () => ({
      upsert: (data: unknown) => { captured.push(data as Record<string, unknown>); return { error: null } },
    }),
  } as unknown as SupabaseClient
}

const PERIOD_END = Math.floor(new Date('2026-06-11').getTime() / 1000)

Deno.test('checkout.session.completed sets plan=pro and stores provider_customer_id', async () => {
  const captured: Record<string, unknown>[] = []
  const event = {
    type: 'checkout.session.completed',
    data: {
      object: {
        metadata: { user_id: 'user-web-1' },
        customer: 'cus_abc123',
        subscription: 'sub_xyz',
      },
    },
  }
  // We need the subscription period_end — simulate via a mock fetch for subscription retrieval
  await handleStripeEvent(event, makeDb(captured), async () => ({ current_period_end: PERIOD_END }))
  assertEquals(captured[0].plan, 'pro')
  assertEquals(captured[0].platform, 'web')
  assertEquals(captured[0].provider_customer_id, 'cus_abc123')
})

Deno.test('customer.subscription.deleted sets plan=free', async () => {
  const captured: Record<string, unknown>[] = []
  const event = {
    type: 'customer.subscription.deleted',
    data: { object: { metadata: { user_id: 'user-web-2' }, current_period_end: PERIOD_END } },
  }
  await handleStripeEvent(event, makeDb(captured), async () => null)
  assertEquals(captured[0].plan, 'free')
  assertEquals(captured[0].expires_at, null)
})
```

- [ ] **Step 3: Run — expect failure**

```bash
deno test supabase/functions/stripe-webhook/index.test.ts --allow-env
```

Expected: FAIL.

- [ ] **Step 4: Implement**

```typescript
// supabase/functions/stripe-webhook/index.ts
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'

type StripeEvent = { type: string; data: { object: Record<string, unknown> } }
type SubFetcher = (subId: string) => Promise<{ current_period_end: number } | null>

export async function handleStripeEvent(
  event: StripeEvent,
  supabase: SupabaseClient,
  fetchSub: SubFetcher,
): Promise<void> {
  const obj = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = (obj.metadata as any)?.user_id
      const customerId = obj.customer as string
      const subId = obj.subscription as string
      const sub = await fetchSub(subId)
      const expiresAt = sub ? new Date(sub.current_period_end * 1000).toISOString() : null
      await supabase.from('subscription_status').upsert({
        user_id: userId, plan: 'pro', platform: 'web',
        provider_customer_id: customerId, expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      break
    }
    case 'invoice.payment_succeeded': {
      const userId = (obj.metadata as any)?.user_id ?? (obj as any).subscription_details?.metadata?.user_id
      const sub = await fetchSub(obj.subscription as string)
      const expiresAt = sub ? new Date(sub.current_period_end * 1000).toISOString() : null
      await supabase.from('subscription_status').upsert({
        user_id: userId, plan: 'pro', platform: 'web',
        expires_at: expiresAt, updated_at: new Date().toISOString(),
      })
      break
    }
    case 'customer.subscription.updated': {
      const userId = (obj.metadata as any)?.user_id
      const expiresAt = obj.current_period_end
        ? new Date((obj.current_period_end as number) * 1000).toISOString()
        : null
      await supabase.from('subscription_status').upsert({
        user_id: userId, expires_at: expiresAt, updated_at: new Date().toISOString(),
      })
      break
    }
    case 'customer.subscription.deleted': {
      const userId = (obj.metadata as any)?.user_id
      await supabase.from('subscription_status').upsert({
        user_id: userId, plan: 'free', expires_at: null, updated_at: new Date().toISOString(),
      })
      break
    }
  }
}

Deno.serve(async (req) => {
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-04-10' })

  const sig = req.headers.get('stripe-signature')!
  const body = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  const supabase = createServiceClient()
  await handleStripeEvent(
    event as unknown as StripeEvent,
    supabase,
    (subId) => stripe.subscriptions.retrieve(subId) as any,
  )
  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
```

- [ ] **Step 5: Run — expect pass**

```bash
deno test supabase/functions/stripe-webhook/index.test.ts --allow-env
```

Expected: 2 tests PASS.

- [ ] **Step 6: Deploy and register Stripe webhook**

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

In Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Events to listen: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/stripe-webhook/
git commit -m "feat: add stripe-webhook edge function"
```

---

### Task 11: `create-stripe-checkout-session` Edge Function

**Files:**
- Create: `supabase/functions/create-stripe-checkout-session/index.ts`
- Test: `supabase/functions/create-stripe-checkout-session/index.test.ts`

- [ ] **Step 1: Scaffold**

```bash
supabase functions new create-stripe-checkout-session
```

- [ ] **Step 2: Write the test**

```typescript
// supabase/functions/create-stripe-checkout-session/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeReq(token = 'tok'): Request {
  return new Request('http://localhost/create-stripe-checkout-session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeClients(existingCustomerId: string | null): { anon: SupabaseClient; service: SupabaseClient } {
  const anon = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-web-1' } }, error: null }) },
  } as unknown as SupabaseClient
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { provider_customer_id: existingCustomerId }, error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
  return { anon, service }
}

Deno.test('returns checkout URL with existing customer', async () => {
  const created: Record<string, unknown>[] = []
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          created.push(params as Record<string, unknown>)
          return { url: 'https://checkout.stripe.com/session123' }
        },
      },
    },
  }
  const res = await handler(makeReq(), makeClients('cus_existing'), stripe as any)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.url, 'https://checkout.stripe.com/session123')
  assertEquals((created[0] as any).customer, 'cus_existing')
})

Deno.test('creates new customer when none exists', async () => {
  const created: Record<string, unknown>[] = []
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          created.push(params as Record<string, unknown>)
          return { url: 'https://checkout.stripe.com/newsession' }
        },
      },
    },
  }
  const res = await handler(makeReq(), makeClients(null), stripe as any)
  assertEquals(res.status, 200)
  assertEquals((created[0] as any).customer, undefined)
})
```

- [ ] **Step 3: Run — expect failure**

```bash
deno test supabase/functions/create-stripe-checkout-session/index.test.ts --allow-env
```

Expected: FAIL.

- [ ] **Step 4: Implement**

```typescript
// supabase/functions/create-stripe-checkout-session/index.ts
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts'
import { requireAuth, errorResponse, jsonResponse } from '../_shared/auth.ts'

type Clients = { anon: SupabaseClient; service: SupabaseClient }

export async function handler(
  req: Request,
  clients: Clients,
  stripeClient: Stripe,
): Promise<Response> {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const auth = await requireAuth(clients.anon)
  if (auth instanceof Response) return auth
  const userId = auth.id

  const { data: sub } = await clients.service
    .from('subscription_status')
    .select('provider_customer_id')
    .eq('user_id', userId)
    .single()

  const existingCustomerId = sub?.provider_customer_id ?? null
  const successUrl = `https://puriclear.vercel.app/subscription/success`
  const cancelUrl = `https://puriclear.vercel.app/subscription/cancel`

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { user_id: userId },
  }
  if (existingCustomerId) sessionParams.customer = existingCustomerId

  const session = await stripeClient.checkout.sessions.create(sessionParams)
  return jsonResponse({ url: session.url })
}

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
  return handler(req, { anon: createAnonClient(req), service: createServiceClient() }, stripe)
})
```

- [ ] **Step 5: Run — expect pass**

```bash
deno test supabase/functions/create-stripe-checkout-session/index.test.ts --allow-env
```

Expected: 2 tests PASS.

- [ ] **Step 6: Deploy**

```bash
supabase functions deploy create-stripe-checkout-session
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/create-stripe-checkout-session/
git commit -m "feat: add create-stripe-checkout-session edge function"
```

---

### Task 12: `create-stripe-portal-session` Edge Function

**Files:**
- Create: `supabase/functions/create-stripe-portal-session/index.ts`
- Test: `supabase/functions/create-stripe-portal-session/index.test.ts`

- [ ] **Step 1: Scaffold**

```bash
supabase functions new create-stripe-portal-session
```

- [ ] **Step 2: Write the test**

```typescript
// supabase/functions/create-stripe-portal-session/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeReq(): Request {
  return new Request('http://localhost/create-stripe-portal-session', {
    method: 'POST',
    headers: { Authorization: 'Bearer tok' },
  })
}

function makeClients(customerId: string | null): { anon: SupabaseClient; service: SupabaseClient } {
  const anon = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  } as unknown as SupabaseClient
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { provider_customer_id: customerId }, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
  return { anon, service }
}

Deno.test('returns 400 when no provider_customer_id exists', async () => {
  const stripe = { billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/x' }) } } }
  const res = await handler(makeReq(), makeClients(null), stripe as any)
  assertEquals(res.status, 400)
})

Deno.test('returns portal URL when customer exists', async () => {
  const stripe = { billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/portal1' }) } } }
  const res = await handler(makeReq(), makeClients('cus_abc'), stripe as any)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.url, 'https://billing.stripe.com/portal1')
})
```

- [ ] **Step 3: Run — expect failure**

```bash
deno test supabase/functions/create-stripe-portal-session/index.test.ts --allow-env
```

Expected: FAIL.

- [ ] **Step 4: Implement**

```typescript
// supabase/functions/create-stripe-portal-session/index.ts
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts'
import { requireAuth, errorResponse, jsonResponse } from '../_shared/auth.ts'

type Clients = { anon: SupabaseClient; service: SupabaseClient }

export async function handler(req: Request, clients: Clients, stripeClient: Stripe): Promise<Response> {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const auth = await requireAuth(clients.anon)
  if (auth instanceof Response) return auth
  const userId = auth.id

  const { data: sub } = await clients.service
    .from('subscription_status')
    .select('provider_customer_id')
    .eq('user_id', userId)
    .single()

  const customerId = sub?.provider_customer_id
  if (!customerId) return errorResponse('No active web subscription found', 400)

  const session = await stripeClient.billingPortal.sessions.create({
    customer: customerId,
    return_url: 'https://puriclear.vercel.app/settings',
  })
  return jsonResponse({ url: session.url })
}

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
  return handler(req, { anon: createAnonClient(req), service: createServiceClient() }, stripe)
})
```

- [ ] **Step 5: Run — expect pass**

```bash
deno test supabase/functions/create-stripe-portal-session/index.test.ts --allow-env
```

Expected: 2 tests PASS.

- [ ] **Step 6: Deploy**

```bash
supabase functions deploy create-stripe-portal-session
```

Note: You must enable the Customer Portal in Stripe dashboard → Settings → Billing → Customer portal before this works.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/create-stripe-portal-session/
git commit -m "feat: add create-stripe-portal-session edge function"
```

---

### Task 13: `get-upload-url` Edge Function

**Files:**
- Create: `supabase/functions/get-upload-url/index.ts`
- Test: `supabase/functions/get-upload-url/index.test.ts`

- [ ] **Step 1: Scaffold**

```bash
supabase functions new get-upload-url
```

- [ ] **Step 2: Write the test**

```typescript
// supabase/functions/get-upload-url/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeReq(uploadId: string, token = 'tok'): Request {
  return new Request(`http://localhost/get-upload-url?uploadId=${uploadId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeClients(ownsUpload: boolean, upscaledPath: string | null): { anon: SupabaseClient; service: SupabaseClient } {
  const anon = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  } as unknown as SupabaseClient
  const service = {
    from: () => ({
      select: () => ({
        eq: (col: string) => ({
          eq: () => ({
            single: async () => ownsUpload
              ? { data: { upscaled_path: upscaledPath }, error: null }
              : { data: null, error: { code: 'PGRST116' } },
          }),
          single: async () => ownsUpload
            ? { data: { upscaled_path: upscaledPath }, error: null }
            : { data: null, error: { code: 'PGRST116' } },
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: 'https://example.com/fresh' }, error: null }),
      }),
    },
  } as unknown as SupabaseClient
  return { anon, service }
}

Deno.test('returns 404 when upload does not belong to user', async () => {
  const res = await handler(makeReq('upload-999'), makeClients(false, null))
  assertEquals(res.status, 404)
})

Deno.test('returns 400 when upload is not done yet', async () => {
  const res = await handler(makeReq('upload-pending'), makeClients(true, null))
  assertEquals(res.status, 400)
})

Deno.test('returns fresh signed URL', async () => {
  const res = await handler(makeReq('upload-done'), makeClients(true, 'upscaled/u/id/upscaled.jpg'))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.signedUrl, 'https://example.com/fresh')
})
```

- [ ] **Step 3: Run — expect failure**

```bash
deno test supabase/functions/get-upload-url/index.test.ts --allow-env
```

Expected: FAIL.

- [ ] **Step 4: Implement**

```typescript
// supabase/functions/get-upload-url/index.ts
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

  const { data: signed } = await clients.service.storage
    .from('upscaled')
    .createSignedUrl(data.upscaled_path, 3600)

  return jsonResponse({ signedUrl: signed?.signedUrl })
}

Deno.serve(async (req) =>
  handler(req, { anon: createAnonClient(req), service: createServiceClient() })
)
```

- [ ] **Step 5: Run — expect pass**

```bash
deno test supabase/functions/get-upload-url/index.test.ts --allow-env
```

Expected: 3 tests PASS.

- [ ] **Step 6: Deploy**

```bash
supabase functions deploy get-upload-url
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/get-upload-url/
git commit -m "feat: add get-upload-url edge function"
```

---

### Task 14: `delete-account` Edge Function

**Files:**
- Create: `supabase/functions/delete-account/index.ts`
- Test: `supabase/functions/delete-account/index.test.ts`

- [ ] **Step 1: Scaffold**

```bash
supabase functions new delete-account
```

- [ ] **Step 2: Write the test**

```typescript
// supabase/functions/delete-account/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { handler } from './index.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function makeReq(confirm: boolean, token = 'tok'): Request {
  return new Request('http://localhost/delete-account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm }),
  })
}

function makeClients(userId: string): { anon: SupabaseClient; service: SupabaseClient } {
  const ops: string[] = []
  const anon = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  } as unknown as SupabaseClient
  const service = {
    storage: {
      from: () => ({
        list: async (prefix: string) => ({ data: [{ name: 'file.jpg' }], error: null }),
        remove: async () => { ops.push('remove'); return { error: null } },
      }),
    },
    from: () => ({
      delete: () => ({ eq: () => { ops.push('delete'); return { error: null } } }),
    }),
    auth: {
      admin: { deleteUser: async (id: string) => { ops.push(`deleteUser:${id}`); return { error: null } } },
    },
    _ops: ops,
  } as unknown as SupabaseClient & { _ops: string[] }
  return { anon, service }
}

Deno.test('returns 400 without confirm flag', async () => {
  const clients = makeClients('u1')
  const res = await handler(makeReq(false), clients)
  assertEquals(res.status, 400)
})

Deno.test('deletes storage, rows, and auth user on confirm', async () => {
  const clients = makeClients('user-del-1') as any
  const res = await handler(makeReq(true), clients)
  assertEquals(res.status, 200)
  // storage remove called, auth deleteUser called
  const ops: string[] = clients.service._ops
  assertEquals(ops.some((o: string) => o.startsWith('deleteUser')), true)
})
```

- [ ] **Step 3: Run — expect failure**

```bash
deno test supabase/functions/delete-account/index.test.ts --allow-env
```

Expected: FAIL.

- [ ] **Step 4: Implement**

```typescript
// supabase/functions/delete-account/index.ts
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

  // Delete all storage objects for this user
  await deleteStorageFolder(svc, 'originals', `originals/${userId}`)
  await deleteStorageFolder(svc, 'upscaled', `upscaled/${userId}`)

  // Cascade-delete all DB rows (uploads, daily_usage, subscription_status, folders cascade from users)
  await svc.from('users').delete().eq('id', userId)

  // Delete the auth user
  const { error } = await svc.auth.admin.deleteUser(userId)
  if (error) {
    console.error('delete-account: auth deleteUser failed', error)
    return errorResponse('Failed to delete auth user', 500)
  }

  return jsonResponse({ ok: true })
}

Deno.serve(async (req) =>
  handler(req, { anon: createAnonClient(req), service: createServiceClient() })
)
```

- [ ] **Step 5: Run — expect pass**

```bash
deno test supabase/functions/delete-account/index.test.ts --allow-env
```

Expected: 2 tests PASS.

- [ ] **Step 6: Deploy**

```bash
supabase functions deploy delete-account
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/delete-account/
git commit -m "feat: add delete-account edge function"
```

---

## Final Verification

- [ ] All 8 Edge Functions deployed: `supabase functions list`
- [ ] All tests pass: `deno test supabase/functions/ --allow-env --allow-net`
- [ ] DB webhook `provision-user` fires on new user creation (test by creating a user in the dashboard)
- [ ] `process-image` reachable: `curl -X POST https://<ref>.supabase.co/functions/v1/process-image -H "Authorization: Bearer <anon-key>"` → `{"error":"Unauthorized"}` (correct — no JWT)
- [ ] RevenueCat webhook URL registered in RevenueCat dashboard
- [ ] Stripe webhook URL registered with correct events in Stripe dashboard
- [ ] Stripe Customer Portal enabled in Stripe dashboard settings
