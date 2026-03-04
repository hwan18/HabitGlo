# Paddle Setup (HabitGlo)

This checklist covers what to configure in Paddle and what to configure in this repo.

Related runbook:
- `docs/lifetime-tracking-minimal.md` for how lifetime accounts are tracked without extra schema.

## 1) Create products and prices in Paddle (Sandbox first)

In Paddle:

1. Create catalog items for monthly and lifetime plans.
2. Copy both price IDs (`pri_...`) for later use.
3. Create a client-side token (`test_...` for sandbox, `live_...` for production).

## 2) Configure app/frontend env values

Set these in local `.env` and production environment variables:

```env
VITE_BILLING_GATE=true
VITE_PADDLE_ENVIRONMENT=sandbox
VITE_PADDLE_CLIENT_TOKEN=test_...
VITE_PADDLE_PRICE_MONTHLY=pri_...
VITE_PADDLE_PRICE_LIFETIME=pri_...
```

Notes:
- Use `VITE_PADDLE_ENVIRONMENT=production` only when going live.
- Price IDs must match the same Paddle environment as the client token.

## 3) Apply DB migration

Run `supabase.sql` so `profiles` includes billing fields:
- `paddle_customer_id`
- `paddle_subscription_id`
- `subscription_status`, `subscription_plan`, `subscription_current_period_end`

## 4) Deploy Supabase Edge Functions (critical)

Deploy functions:

```bash
npx supabase functions deploy create-paddle-checkout-gate --project-ref <YOUR-PROJECT-REF>
npx supabase functions deploy create-paddle-portal --project-ref <YOUR-PROJECT-REF>
npx supabase functions deploy paddle-webhook --project-ref <YOUR-PROJECT-REF> --no-verify-jwt
```

Important:
- `paddle-webhook` must be deployed with `--no-verify-jwt`.
- Keep `create-paddle-checkout-gate` JWT-protected (default behavior).
- Keep `create-paddle-portal` JWT-protected (default behavior).

Set function secrets:

```bash
npx supabase secrets set --project-ref <YOUR-PROJECT-REF> PADDLE_API_KEY=live_...
npx supabase secrets set --project-ref <YOUR-PROJECT-REF> PADDLE_NOTIFICATION_WEBHOOK_SECRET=pdl_ntfset_...
```

Optional:

```bash
npx supabase secrets set --project-ref <YOUR-PROJECT-REF> PADDLE_API_BASE_URL=https://api.paddle.com
npx supabase secrets set --project-ref <YOUR-PROJECT-REF> PADDLE_SIGNATURE_MAX_AGE_SECONDS=900
```

Notes:
- `PADDLE_SIGNATURE_MAX_AGE_SECONDS` defaults to `300` if unset.
- Use `900` if your Paddle test deliveries are delayed and failing with timestamp age mismatch.

Quick check:
- Send unauthenticated `POST` to `https://<YOUR-PROJECT-REF>.functions.supabase.co/paddle-webhook`.
- Expected: `400` (`Missing paddle-signature header` or `Invalid Paddle signature`).
- If you still get `401`, redeploy with `--no-verify-jwt`.

## 5) Configure Paddle notification destination

In Paddle dashboard, add notification destination:

`https://<YOUR-PROJECT-REF>.functions.supabase.co/paddle-webhook`

Subscribe to at least:
- `transaction.completed`
- `subscription.created`
- `subscription.updated`
- `subscription.canceled`

Copy that destination's endpoint secret into Supabase secret:
- `PADDLE_NOTIFICATION_WEBHOOK_SECRET`

PowerShell digest check (to catch hidden spaces/quotes):

```powershell
npx supabase secrets list --project-ref <YOUR-PROJECT-REF>
$secret = 'pdl_ntfset_...'
[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($secret))).ToLower()
```

The SHA-256 output must exactly match the `DIGEST` shown for `PADDLE_NOTIFICATION_WEBHOOK_SECRET`.

## 6) Configure approved domains in Paddle (production)

For live checkout, approve all production domains you use to launch checkout:
- `https://habitglo.com`
- `https://www.habitglo.com`

If checkout starts on `www`, that exact subdomain must be approved.

## 7) Configure static website checkout values

Edit `public/download/config.js`:

```js
supabase: {
  url: 'https://<PROJECT-REF>.supabase.co',
  anonKey: 'sb_publishable_...',
},
paddle: {
  environment: 'sandbox', // or 'production'
  clientToken: 'test_...', // use live_... in production
  prices: {
    monthly: 'pri_...',
    lifetime: 'pri_...',
  },
}
```

Website purchase should start at:
- `/purchase?plan=monthly`
- `/purchase?plan=lifetime`

`/purchase` signs users in, then redirects to account-linked checkout routes:
- `/checkout/monthly.html`
- `/checkout/lifetime.html`

These pages require an authenticated account-link URL for metadata mapping:
- `uid` (Supabase user UUID, also accepts `user_id`/`supabase_user_id`)
- `email` (recommended; prefill checkout email)
- `source` (stored as `custom_data.checkout_source`)

Example:

`/checkout/monthly.html?uid=<SUPABASE-USER-UUID>&email=user@example.com&source=app`

If `uid` is missing or invalid, checkout is intentionally blocked on static pages.

## 8) Smoke test (sandbox, then production)

1. Start with sandbox token + sandbox price IDs.
2. Open `/purchase?plan=monthly`, sign in, and confirm redirect to `/checkout/monthly.html?uid=...`.
3. Complete a monthly checkout and a lifetime checkout.
4. Verify Paddle sends webhook events successfully.
5. In Supabase `profiles`, confirm:
   - `subscription_status`
   - `subscription_plan`
   - `paddle_customer_id`
   - `paddle_subscription_id` (monthly flow)
6. Repeat after switching to production values.

## 9) Troubleshooting: payment completed but profile not updated

If Paddle shows payment completed but your app/Supabase account does not update:

1. Confirm checkout was launched through `/purchase` and checkout URL included a valid `uid` query param.
2. In Paddle notification payload, confirm:
   - `data.custom_data.supabase_user_id` exists and matches your Supabase user ID.
3. Confirm webhook delivery is `200` for the real event (not simulation-only payload).
4. Query `profiles` by that `user_id` and verify billing fields updated.
