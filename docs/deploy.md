For this backend, you need to deploy/configure these pieces, roughly in this order.

Usefull keys:
YOUR_PROJECT_REF=zxvelrjrogearuovdamc
PROVISION_USER_WEBHOOK_SECRET=1OimDWUGtEIwkpHxTZg4aPSvFfrXM3hYKsA2eLCNbq7VlJ8jdcuy0nQz9RB5o6
REVENUECAT_WEBHOOK_SECRET=RlkudT5IUy67FKoiObfe4NQxXYsWABcCMa0DgqZjLE9GH2Pwzp1nmrh3vJtSV8
FAL_API_KEY=6358c14e-ad8a-4c75-a24e-08405939656f:645fc877359885bea223dc5107db623f

1. Link Your Project
From repo root:

supabase login
supabase link --project-ref YOUR_PROJECT_REF
2. Set Secrets
Minimum for all backend functions:

supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
supabase secrets set SUPABASE_ANON_KEY=YOUR_ANON_KEY
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set FAL_API_KEY=YOUR_FAL_API_KEY
supabase secrets set STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
supabase secrets set STRIPE_PRICE_ID=YOUR_STRIPE_PRICE_ID
supabase secrets set STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET
supabase secrets set REVENUECAT_WEBHOOK_SECRET=YOUR_REVENUECAT_WEBHOOK_SECRET
supabase secrets set PROVISION_USER_WEBHOOK_SECRET=YOUR_RANDOM_SECRET
For just provision-user, you only need:

supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set PROVISION_USER_WEBHOOK_SECRET=YOUR_RANDOM_SECRET
3. Deploy Database Migrations
These are present:

20260511000000_initial_schema.sql
20260511000001_rls_policies.sql
20260511000002_quota_rpc.sql
Deploy them with:

supabase db push
4. Create Storage Buckets Manually
In Supabase Dashboard -> Storage:

originals   private
upscaled    private
Public bucket must be OFF for both.

5. Deploy Edge Functions
Deploy all 8 functions:

supabase functions deploy provision-user --no-verify-jwt
supabase functions deploy process-image
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy create-stripe-checkout-session
supabase functions deploy create-stripe-portal-session
supabase functions deploy get-upload-url
supabase functions deploy delete-account
Why some use --no-verify-jwt: those are called by dashboards/webhooks, not directly by a logged-in app user.

6. Configure Supabase DB Webhook
Dashboard -> Database -> Webhooks -> Create webhook:

Name: provision-user
Table: auth.users
Events: INSERT
Type: HTTP Request
URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/provision-user
Header:
  x-webhook-secret: YOUR_RANDOM_SECRET
This secret must match PROVISION_USER_WEBHOOK_SECRET.

7. Configure External Dashboards
Stripe:

Create product/price: ¥980 monthly
Set STRIPE_PRICE_ID
Create webhook endpoint:
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
Copy signing secret into STRIPE_WEBHOOK_SECRET
Enable Stripe Customer Portal
RevenueCat:

Create app/products/entitlement
Configure webhook endpoint:
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/revenuecat-webhook
Use same secret as REVENUECAT_WEBHOOK_SECRET
fal.ai:

Create/get API key
Set FAL_API_KEY
8. Quick Verification
After this, test:

supabase functions list
supabase secrets list
Then create a test user in Supabase Dashboard -> Authentication -> Users. If the DB webhook works, rows should appear in:

public.users
public.subscription_status
That’s the full backend deploy checklist. The immediate next safest path is: link project -> set Supabase/provision secrets -> supabase db push -> deploy provision-user -> configure DB webhook -> test user provisioning.

