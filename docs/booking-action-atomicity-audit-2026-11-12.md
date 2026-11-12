# Booking action and payment boundary review — 12 November 2026

Base reviewed: origin/main dd97c53. This is a targeted source review and isolated regression record, not an assertion that every line, production configuration or provider behaviour has been audited.

## Confirmed defects and change

The email confirmation/cancellation API consumed its one-use token before reading and updating the booking. A failed booking query/update therefore spent a valid link. Confirmation ignored the update error and could report success. Cancellation checked a previously fetched appointment time, allowing a concurrent salon move to change the applicable deadline before the write. A JSON `null` body also threw instead of returning a controlled validation error.

Migration `20261112233000_atomic_booking_confirm_cancel.sql` adds a private, service-role-only `apply_booking_action_token(text,text)` function. It locks booking then token (matching reschedule's order), checks current expiry/status/cancellation window after waiting, creates the public receipt, changes the booking and consumes the token in one transaction. Database exceptions roll back both writes. The HTTP route returns a generic retryable 503 on database failure; the page treats non-2xx as failure. A caller-supplied booking ID is never accepted. Capability is the unguessable, expiring, action-specific email token; a customer account is not required.

No payment, refund, notification-send or production database was exercised. Cancellation still queues the existing change-email outbox through the database trigger. In the real route, delivery is attempted after commit, with the existing cron retry path on delivery error.

## Validation actually performed

- `node scripts/test-booking-action-tokens.mjs`: 89 assertions, isolated PGlite and actual API handler with database/messaging boundaries mocked. Invalid, expired, used and wrong-action links; terminal booking states; cancellation deadline; confirmation timestamp; injected booking write and token write failures; retry; public-role denial; caller booking-ID smuggling; HTTP errors and absence of notification attempts on failure.
- `node scripts/test-schema-replay.mjs`: 171 migrations replayed, 72 public tables, all existing assertions passed plus 7 full-schema confirmation/cancellation/outbox assertions. Supabase Auth/Storage and external services are fixtures.
- Four two-connection PostgreSQL 17 races passed: appointment moved inside deadline while action waits; token expires during lock wait; token invalidated by concurrent transaction; simultaneous cancellation requests yield exactly one success. Fictional local cluster was stopped afterwards. Reproduction and JSON evidence: `C:/bookzenvo/private-launch-records/booking-action-races-2026-11-12/`.
- `npx tsc --noEmit`: passed.
- Existing targeted regressions passed: scheduling 88; balance checkout 50; refund webhook 30; payment return 8; checkout privacy; appointment waitlist API 41 plus 1,460 date/time-zone cases.

## Files manually reviewed

Complete source read for this pass:

- `src/lib/public-booking.functions.ts`
- `src/lib/gift-card.functions.ts`
- `src/lib/stripe-connect.functions.ts`
- `src/lib/balance-checkout.server.ts`
- `src/lib/booking-tokens.server.ts`
- `src/lib/better-time-offers.server.ts`
- `src/routes/api.stripe-webhook.ts`
- `src/routes/api/booking-actions/act.ts`
- `src/routes/api/booking-actions/reschedule-commit.ts`
- `src/routes/api/appointment-waitlist.ts`
- `src/routes/api/better-time-offer.ts`
- `src/routes/booking-action.$action.$token.tsx`
- `src/lib/request-limits.ts`
- `supabase/migrations/20260922004000_atomic_booking_reschedule.sql`
- `supabase/migrations/20260923007000_staff_booking_change_permissions.sql`
- New migration and new regression files in this change.

Partial source inspection: `src/routes/portal.bookings.tsx` (query/cancel/list/card portions); portal RPC definitions in `20260927010000_narrow_portal_and_shared_calendar_access.sql`; grant inventory in `scripts/schema-function-access-checks.mjs`; existing scheduling/schema fixtures and better-time-offer assertions. Other migrations were replayed automatically, not all individually read in this pass. Existing automated tests are not proof of complete manual coverage.

Further targeted review continues separately. Not exercised here: actual Stripe dashboard/Terminal hardware, hosted webhook configuration, live customer portal accounts, production RLS/grants, email delivery, mobile devices, full public checkout browser journey or performance/load. No real booking or charge was created.

## Release order and rollback

1. Review current production migration state and take the normal verified backup before the authorised release. Run the read-only preflight below; inspect column/type and helper availability. Do not use this document as evidence the migration has been applied.
2. Apply migration `20261112233000` before deploying the route. It is additive: no data deletion or existing function replacement. Run the post-migration read-only grant check and verify the actual function definition matches the reviewed file.
3. Deploy the matching web revision only after the RPC exists. Missing RPC fails closed with 503; it must not be papered over by falling back to the old consume-then-update implementation.
4. In an isolated/test account, confirm and cancel fictional appointments and verify the outbox and UI. Do not send real customer messages as part of this audit.
5. If the new web route must be withdrawn, leaving the private additive function in place is safe. Rolling back to the old route reintroduces the defects above; prefer temporarily disabling confirmation/cancellation email actions and directing customers to the salon until corrected. Do not drop the RPC while the new route is live. A later authorised removal can use `drop function public.apply_booking_action_token(text,text)` only after confirming no deployed callers; no schema rollback is performed by this audit.

Read-only preflight:

```sql
select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in
 ('booking_action_tokens','bookings','businesses','services','staff')
order by table_name,ordinal_position;
select to_regprocedure('public.reschedule_booking_with_token(text,timestamptz)') as existing_lock_order_reference,
       to_regprocedure('public.apply_booking_action_token(text,text)') as new_function;
```

Read-only checks after migration (expected service=true, anon=false, authenticated=false, SECURITY DEFINER=true; search_path fixed):

```sql
select has_function_privilege('service_role','public.apply_booking_action_token(text,text)','execute') as service_can_execute,
       has_function_privilege('anon','public.apply_booking_action_token(text,text)','execute') as anon_can_execute,
       has_function_privilege('authenticated','public.apply_booking_action_token(text,text)','execute') as authenticated_can_execute;
select p.prosecdef,p.proconfig,pg_get_functiondef(p.oid)
from pg_proc p where p.oid='public.apply_booking_action_token(text,text)'::regprocedure;
```
