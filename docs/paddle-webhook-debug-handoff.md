# Paddle Webhook Debug Handoff

Date: February 25, 2026

## Last confirmed finding

From the Paddle delivery JSON you shared:

- `event_id` starts with `ntfsimevt_` (simulation event).
- `data.custom_data` is `null`.
- `data` does not include `customer.email`.

Because of that, the `paddle-webhook` function cannot map this event to a `profiles.user_id`, so it does not update subscription status.

## What to do next

1. Run a real sandbox checkout from the app while signed in (not just Paddle simulation).
2. If using static checkout page, include `uid` and `email` in URL:
   - `/checkout/monthly.html?uid=<SUPABASE_USER_UUID>&email=<user@email>`
3. In Paddle Notifications, inspect the real delivery payload and confirm:
   - `data.custom_data.supabase_user_id` exists and matches your Supabase Auth user UUID.
4. Click `Refresh billing status` in the app or query `profiles` in Supabase to confirm update.

## Note

You do not need a new test account just for this issue.
