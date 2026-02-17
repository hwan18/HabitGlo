# Paddle Setup (HabitGlo)

This setup keeps the existing billing gate behavior and switches checkout/portal actions to Paddle.

## 1) Configure frontend env

Set these in your local `.env` (and production environment variables):

```env
VITE_BILLING_GATE=true
VITE_PADDLE_ENVIRONMENT=sandbox
VITE_PADDLE_CLIENT_TOKEN=test_...
VITE_PADDLE_PRICE_MONTHLY=pri_...
VITE_PADDLE_PRICE_LIFETIME=pri_...
```

Notes:
- Use `VITE_PADDLE_ENVIRONMENT=production` for live.
- `VITE_PADDLE_CLIENT_TOKEN` is the Paddle.js client-side token from your Paddle account.

## 2) Apply DB migration

Run `supabase.sql` so `profiles` includes:
- `paddle_customer_id`
- `paddle_subscription_id`

## 3) Deploy Supabase Edge Functions

Deploy:

```bash
supabase functions deploy create-paddle-portal
supabase functions deploy paddle-webhook
```

Set function secrets:

```bash
supabase secrets set PADDLE_API_KEY=live_...
supabase secrets set PADDLE_NOTIFICATION_WEBHOOK_SECRET=pdl_ntfset_...
```

Optional:

```bash
supabase secrets set PADDLE_API_BASE_URL=https://api.paddle.com
```

## 4) Configure Paddle webhook destination

In Paddle developer tools, add notification destination:

`https://<YOUR-PROJECT-REF>.functions.supabase.co/paddle-webhook`

Subscribe to at least:
- `transaction.completed`
- `subscription.created`
- `subscription.updated`
- `subscription.canceled`

Copy the endpoint secret to `PADDLE_NOTIFICATION_WEBHOOK_SECRET`.

## 5) Website checkout config

Set Paddle.js values in:

`public/download/config.js`

```js
paddle: {
  environment: 'sandbox', // or 'production'
  clientToken: 'test_...',
  prices: {
    monthly: 'pri_...',
    lifetime: 'pri_...',
  },
}
```

The website checkout pages (`/checkout/monthly.html`, `/checkout/lifetime.html`) open Paddle checkout
directly with these values and route successful payments to `/download/windows.html`.

## 6) Smoke test

1. Sign in to HabitGlo app.
2. Click `Start Monthly` or `Buy Lifetime` in Account panel.
3. Complete checkout.
4. Click `Refresh Billing Status`.
5. Confirm `profiles.subscription_status` updates via webhook.
