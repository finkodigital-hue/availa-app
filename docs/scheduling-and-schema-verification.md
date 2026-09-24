# Scheduling and schema verification — 24 September 2026

Preparation and cleanup buffers now belong to each booking and paid reservation. Editing the service no longer changes an existing booking's occupied time. Prior records use the current service buffers once because the original system did not retain their historical values. No appointment times or statuses are changed by this migration.

The database conflict checker includes both appointments' buffers, preserves processing gaps, respects outstanding paid reservations and serialises checks by staff. Raw writes, calendar moves, resize, undo, public booking and customer rescheduling share the check. Public slot previews receive only timing data and account for the saved buffers. The final pre-check now uses the preparation start rather than shifting the service after its displayed start.

New or moved future appointments also enforce business/staff hours, recurring weeks, holidays, time off, active staff/services and service assignments at the database boundary. Financial/status-only changes do not revalidate an unchanged schedule. Cancellation remains possible. Historical records can still be entered without inventing past working hours. Accepted paid holds retain the schedule already offered to the customer; identity, tenant and collision checks still apply. No future out-of-hours override is implemented.

## Evidence

- 88 scheduling/token/reservation/payment assertions execute the actual database functions, including 43 new buffer and manual-window cases and frontend segment checks.
- All 123 application migrations replay into a clean PGlite database. Another 45 assertions exercise the resulting complete application schema for owner/manager/front-desk/practitioner/customer/unrelated/anonymous access, cross-tenant reads/writes, invitations and revocation, exports, MFA and private storage policies. Two migration assertions cover backfilling a near-term booking and restoring the administrative request context.
- The full release suite contains 290 assertions, plus migration replay, TypeScript, production compilation and the 59-table security boundary check.

The full-schema review also found that the old customer cancellation deadline prevented authorised reception staff from completing or cancelling today's appointments. Calendar operators now retain their existing management rights while customers remain subject to the deadline. Forged payment-provider fields remain blocked.

This is a full **application migration** replay, not a full Supabase deployment. Auth and Storage system objects are minimal local fixtures; cron/HTTP/Vault operations are inert. No real email, token issuance, Storage signed URL, payment or external job occurs. PGlite runs one database connection; this is not a multi-connection load/concurrency test or production backup restoration. Live MFA/recovery, independent security review and a physical-device salon pilot remain required.
