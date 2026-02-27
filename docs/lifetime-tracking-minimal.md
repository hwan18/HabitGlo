# Minimal Lifetime Tracking (No Extra Schema)

Date: 2026-02-27

## Summary

This project uses `profiles` in Supabase as the source of truth for access.

- No additional billing audit table is required.
- No schema migration is required.
- No function contract changes are required.

## Entitlement Model

Access is based on `profiles.subscription_status` and `profiles.subscription_plan`.

- Monthly paid user:
  - `subscription_status` is typically `active` (or `trialing` / `past_due`)
  - `subscription_plan` is `monthly`
  - `paddle_subscription_id` is set
- Lifetime user:
  - `subscription_status` is `lifetime`
  - `subscription_plan` is `lifetime`
  - `paddle_subscription_id` is `null` by design (lifetime is not recurring)

## Paddle Linkage Model

For support/refunds, use:

- `profiles.paddle_customer_id` as the primary Paddle lookup key

This is enough to locate all customer transactions/subscriptions in Paddle.

Related checkout policy:

- `docs/paddle-setup.md` (web checkout must include valid `uid` so purchases map to a user profile).

## Support / Refund Lookup Procedure

1. Find the user in Supabase (`auth.users` or `profiles`).
2. Read `profiles.paddle_customer_id`.
3. Open Paddle dashboard and search the customer by that ID.
4. Review customer timeline, payments, and subscriptions.
5. For monthly -> lifetime upgrades, inspect:
   - lifetime transaction in Paddle payments
   - canceled recurring subscription in Paddle subscriptions/history

## SQL Checks (Supabase)

Use these checks when validating user state:

```sql
select user_id, email, subscription_status, subscription_plan,
       paddle_customer_id, paddle_subscription_id, subscription_updated_at
from profiles
where user_id = '<SUPABASE_USER_UUID>';
```

## Expected Test Outcomes

1. Monthly purchase:
   - `subscription_status` becomes `active`
   - `subscription_plan` becomes `monthly`
   - `paddle_subscription_id` is populated
2. Lifetime purchase:
   - `subscription_status` becomes `lifetime`
   - `subscription_plan` becomes `lifetime`
   - `paddle_subscription_id` becomes `null`
3. Duplicate monthly attempt while already active:
   - checkout gate sends user to billing portal instead of new monthly checkout
4. Fresh session validation:
   - restart desktop + sign out/in
   - lifetime user still has access

## Assumptions

1. Profile-based entitlement is sufficient for current product needs.
2. Audit-grade event history is intentionally out of scope for now.
3. If support volume grows, an event audit table can be added later without changing entitlement logic.
