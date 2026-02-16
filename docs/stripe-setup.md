# Stripe Setup (Supabase + HabitGlo)

This project now includes Stripe integration for:

- checkout session creation from the signed-in app user
- Stripe billing portal
- webhook-driven subscription status sync into `profiles`

## 1) Create Stripe products/prices

In Stripe Dashboard:

1. Create product `HabitGlo Monthly` with recurring monthly price.
2. Create product `HabitGlo Lifetime` with one-time price.
3. Copy both `price_...` IDs.

## 2) Apply database changes

Run `supabase.sql` in Supabase SQL editor (or apply the migration helper `ALTER` statements at the bottom if you already have tables).

This adds Stripe-related profile fields:

- `stripe_customer_id`
- `stripe_subscription_id`
- `subscription_plan`
- `subscription_status`
- `subscription_current_period_end`
- `subscription_updated_at`

## 3) Deploy edge functions

From repo root (with Supabase CLI logged in and linked):

```bash
supabase functions deploy create-stripe-checkout
supabase functions deploy create-stripe-portal
supabase functions deploy stripe-webhook
```

## 4) Set function secrets

Set these in Supabase project secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY`
- `STRIPE_PRICE_LIFETIME`
- `PUBLIC_SITE_URL` (example `https://habitglo.app`)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are used by functions and should be available in Supabase runtime.

## 5) Configure Stripe webhook

In Stripe Dashboard -> Developers -> Webhooks:

1. Endpoint URL:
   - `https://<PROJECT-REF>.functions.supabase.co/stripe-webhook`
2. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
3. Copy the signing secret and set it as `STRIPE_WEBHOOK_SECRET`.

## 6) Desktop app flow after setup

1. User signs in.
2. In Account panel, click `Start Monthly` or `Buy Lifetime`.
3. App calls `create-stripe-checkout` and opens Stripe-hosted checkout.
4. Webhook updates `profiles.subscription_status`.
5. Back in app, click `Refresh Billing Status`.
6. App unlocks when status is `active`, `trialing`, or `lifetime`.

## 7) Notes

- This integration gates desktop app access by subscription status.
- Billing gate behavior:
  - Development: defaults OFF unless `VITE_BILLING_GATE=true`
  - Production: defaults ON unless `VITE_BILLING_GATE=false`
- If you later want strict website-side download protection, add a backend endpoint that verifies entitlement before issuing short-lived download URLs.
