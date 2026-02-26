# Billing Hardening Implementation

Date: 2026-02-26

## Goal

Prevent duplicate recurring subscriptions, preserve lifetime access, and make checkout behavior predictable for existing paid users.

## What Was Implemented

1. Added checkout gate edge function:
   - File: `supabase/functions/create-paddle-checkout-gate/index.ts`
   - Behavior:
     - If user is lifetime (`subscription_status` or `subscription_plan` is `lifetime`): return `blocked`.
     - If user requests monthly while already paid recurring (`active|trialing|past_due`): return `portal` URL instead of opening another checkout.
     - Allow checkout for lifetime purchase (including monthly -> lifetime upgrade).

2. Updated frontend billing flow:
   - File: `src/lib/billing.ts`
   - Changes:
     - Added authenticated edge function helper for billing functions.
     - Added checkout gate call to `create-paddle-checkout-gate`.
     - `startCheckout()` now returns result actions:
       - `checkout_opened`
       - `portal_opened`
       - `blocked` (`already_lifetime`)

3. Updated account UI billing actions:
   - File: `src/components/AuthPanel.tsx`
   - Changes:
     - Handles new checkout result actions and status messages.
     - Shows `Upgrade to Lifetime` button for paid non-lifetime users.
     - Keeps `Manage Billing` for recurring plans.

4. Hardened Paddle webhook behavior:
   - File: `supabase/functions/paddle-webhook/index.ts`
   - Changes:
     - Added lifetime precedence: monthly events no longer downgrade lifetime profiles.
     - Added duplicate monthly guard:
       - If another monthly subscription event/transaction arrives while a canonical active monthly exists, cancel duplicate in Paddle and ignore profile overwrite.
     - On lifetime transaction completion:
       - Cancels existing monthly subscription in Paddle immediately (`effective_from: immediately`).
       - Writes profile as lifetime and clears recurring subscription ID.
     - Added stronger error handling for profile updates.

5. Updated deployment docs:
   - File: `docs/paddle-setup.md`
   - Added deployment command for `create-paddle-checkout-gate`.
   - Clarified JWT expectations (`checkout-gate` protected, `paddle-webhook` no-verify-jwt).

## Files Changed

- `src/lib/billing.ts`
- `src/components/AuthPanel.tsx`
- `supabase/functions/paddle-webhook/index.ts`
- `supabase/functions/create-paddle-checkout-gate/index.ts` (new)
- `docs/paddle-setup.md`

## Verification Run

- `npm run build` passed successfully.

## Required Deploy Step

Run these before testing in cloud:

```bash
npx supabase functions deploy create-paddle-checkout-gate --project-ref <YOUR-PROJECT-REF>
npx supabase functions deploy create-paddle-portal --project-ref <YOUR-PROJECT-REF>
npx supabase functions deploy paddle-webhook --project-ref <YOUR-PROJECT-REF> --no-verify-jwt
```

Ensure secrets are set:

- `PADDLE_API_KEY`
- `PADDLE_NOTIFICATION_WEBHOOK_SECRET`

## Suggested Commit Message

`feat(billing): add checkout gate, lifetime precedence, and duplicate subscription protection`
