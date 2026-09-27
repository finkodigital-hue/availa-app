# Supabase adviser review — 27 September 2026

This records the production review behind the Supabase Security and Performance Adviser counters. Adviser labels are prompts for review; they are not all exploitable defects, and removing a label is not more important than preserving the application's security and availability.

## Production changes applied

- Added indexes for the two previously unindexed appointment-waitlist foreign keys.
- Consolidated overlapping permissive row-level security policies into one equivalent policy per role and operation. The access predicates remain the logical OR of the previous policies.
- Added explicit restrictive deny policies to three server-only tables that already had all client privileges revoked.
- Removed anonymous direct table-write grants throughout the public schema. Public mutations continue through validated RPCs and server routes.
- Restricted the four public projection views to `SELECT` for anonymous, authenticated and service roles.
- Removed the PostgreSQL `PUBLIC` execute grant from `get_public_salon_professionals`; only the named application roles can execute it.
- Enabled secure email changes and secure password changes in Supabase Auth. Set the minimum password length to eight and required lowercase, uppercase, digits and symbols.

## Before and after

| Adviser | Before | After | Explanation |
|---|---:|---:|---|
| Performance errors | 0 | 0 | No database performance errors. |
| Performance warnings | 51 | 0 | All overlapping-policy warnings were removed. |
| Performance suggestions | 84 | 84 | The two missing-FK-index findings were fixed. All current suggestions are `unused_index`; the two new indexes also appear unused until production traffic exercises them. |
| Security errors | 4 | 4 | Four deliberately narrow public projection views use definer rights so public booking can read safe columns without granting access to private base tables. |
| Security warnings | 29 | 32 | Reviewed function-capability findings plus leaked-password protection, which is unavailable on the current Supabase Free plan. Three guarded RPCs added by the final access-hardening release account for the increase. |
| Security suggestions | 3 | 0 | All three RLS-without-policy suggestions were removed with explicit deny policies. |

## Why the remaining security labels stay

The four views are `blocked_dates_public`, `public_businesses`, `public_staff` and `public_booking_slots`. They are the public-booking boundary. Their columns are pinned by automated tests, client roles have read-only grants, and the underlying tables remain protected. Changing them to invoker rights without redesigning the public API would either break booking or require broader base-table access.

The function warnings identify intentionally callable entry points. Anonymous functions expose only public booking or high-entropy invitation lookups and apply narrow output, expiry, assurance or identity checks. Authenticated functions enforce ownership, role, verified identity, invitation target, portal-customer or request-bound checks. The final release added guarded staff-archive and customer-portal RPCs, increasing this counter without widening their grants. Schema tests also verify that no application function is executable by PostgreSQL's catch-all `PUBLIC` role.

Leaked-password protection can only be enabled after upgrading Supabase. The password-strength and secure-change settings above reduce risk in the meantime. CAPTCHA also requires a configured provider and keys, so it was not enabled as part of this database change.

The 84 performance suggestions are unused-index telemetry from a young, low-traffic database. There are no exact duplicate indexes and no remaining unindexed foreign keys. Removing indexes solely to lower this counter could slow booking, reporting and tenant-security queries as usage grows. Reassess them after a representative production workload has accumulated.

## Verification

- All 156 repository migrations replayed from an empty database.
- 95 schema role/security assertions passed, including no overlapping policy groups, no RLS table without a policy, no anonymous direct table writes, exact read-only grants on the four public views, private-image path boundaries and no application function granted to `PUBLIC`.
- The complete production build and launch regression suites passed.
- Live production checks returned zero overlapping policy groups, zero unindexed foreign keys, zero RLS tables without policies, zero anonymous direct writes, zero public-view write grants and zero `PUBLIC` function grants.
- The live Pasha Hair booking page loaded services, staff and the date/availability step after the migrations. No booking was submitted.
- Production migration history records all five final hardening migrations through `20260927010000`; release `f874e3729c915840993277324d1750b0a7e440e4`, its GitHub website check, production uptime workflow, exact deployment marker and live verification all passed.

This work materially strengthens the production boundary; it is not a claim that the service is impossible to hack or a substitute for independent penetration testing.
