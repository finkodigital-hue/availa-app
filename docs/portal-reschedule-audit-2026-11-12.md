# Customer portal rescheduling — 12 November 2026

Follow-on to the booking action audit. No production writes, messages or provider calls.

## Reproduced and fixed

The portal called `reschedule_booking`, a SECURITY INVOKER function which reads the underlying bookings table. The September privacy migration correctly removed portal customers' whole-row access and provided narrow read/cancel functions, but omitted rescheduling. A UID-bound, verified fictional customer could list their appointments and cancel through the narrow function, while the actual reschedule call raised `Booking not found`.

New migration `20261112233500_narrow_customer_reschedule.sql` introduces `reschedule_portal_booking`. It checks request assurance, matches the customer by the authenticated UID, locks that customer's booking, verifies its confirmed status and current cancellation deadline, validates the new staff/service/opening-hours/conflict/duration rules and calls the existing transactional update machinery. Base booking grants and staff rescheduling remain unchanged. It returns no private booking data. The portal now uses this function.

Both reschedule HTTP handlers also rejected JSON `null` by throwing before validation; they now return 400 for non-object bodies. This is a validation correction, not a new authorisation grant.

## Evidence

- Existing broken-call behaviour is asserted in the full-schema role suite alongside the replacement's success, with customer base-row reads still denied.
- Wrong-customer booking, null date, outside-hours slot, conflicting slot, cancelled booking, expired cancellation window and anonymous execution are rejected.
- `test-schema-replay.mjs`: 172 migrations; 106 role assertions (10 more than baseline); all other schema suites and seven atomic email-action assertions passed.
- `test-booking-action-tokens.mjs`: 97 assertions (eight new malformed-body cases across peek and commit).
- Type-check run on the combined branch; final result recorded in the parent handoff.

## Expanded source coverage

Additional complete source reads: `src/routes/portal.bookings.tsx`, `src/routes/portal.tsx`, `src/routes/portal.profile.tsx`, `src/lib/portal-customer.ts`, `src/lib/payment-reconciliation.server.ts`, `src/lib/cash-payment.functions.ts`, `src/routes/api/booking-actions/reschedule-peek.ts`, `supabase/migrations/20260908150000_harden_customer_mutations.sql`, `20260922007000_validate_portal_reschedule.sql`, `20260927010000_narrow_portal_and_shared_calendar_access.sql`, `20260926002000_harden_gift_purchase_fulfillment.sql` and the new migration. Relevant UID/customer guard definitions in `20260926011000_gate_workspace_creation_and_upload_types.sql` inspected; the entire file was not manually reviewed. Gift-page source inspected through its checkout form; public gift sales are disabled in the current UI.

Read-only review did not identify another confirmed money-ledger defect in the Stripe webhook, checkout, gift-card server functions or payment-recovery code in this pass. That is not proof of live-provider readiness. Existing tests use fictional signed events/provider responses, not Stripe or Twilio accounts. Browser-level authenticated portal execution, hosted permission state, genuine reader/refund and delivery tests remain distinct release checks.

## Apply before web release

Apply `20261112233500` before deploying the changed portal call. It is additive; do not loosen bookings policies to make the old function work. Read-only post-check:

```sql
select has_function_privilege('authenticated','public.reschedule_portal_booking(uuid,timestamptz)','execute') as customer_role_can_execute,
       has_function_privilege('anon','public.reschedule_portal_booking(uuid,timestamptz)','execute') as anonymous_can_execute;
select p.prosecdef,p.proconfig,pg_get_functiondef(p.oid)
from pg_proc p where p.oid='public.reschedule_portal_booking(uuid,timestamptz)'::regprocedure;
```

Expected authenticated=true, anonymous=false, fixed search path and SECURITY DEFINER=true. The function's internal UID check is essential: a role-level grant alone does not establish authorisation. Verify actual definition matches the migration. A web rollback leaves the additive function safe to retain but restores the old portal bug. Prefer disabling the reschedule control temporarily if a rollback is necessary. Never drop the function while the new portal calls it.
