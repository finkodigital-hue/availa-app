# Website launch remediation — 22 September 2026

Authorised scope: fix, test and deploy the website, including mobile-web layouts. Native apps deferred by the founder. Stripe remains sandbox; the founder's real-card test is the final step when they return. No paid Twilio upgrade authorised yet.

Company details supplied: BOOKZENVO LTD, SC902170, registered in Scotland, Pinefield, Tomich, Cannich, IV4 7LY; help@bookzenvo.com.

## Live configuration

- Supabase Confirm email enabled on 22 September. Existing four confirmed accounts still require provenance review; changing the setting does not reverify them.
- Production dashboard reported no backups. Backup/restore evidence remains a launch requirement.
- Access migration 20260922001000 applied successfully. Live read-only probes: private blocked-time columns return 401; safe availability view returns 200; auth settings report mailer_autoconfirm=false.
- Scheduling migration 20260922002000 applied successfully. Anonymous bookings now validate business-local hours, holidays, repeating staff schedules, service assignments, blocks and payment requirements.

## Changes in preparation (not yet deployed)

- Tenant privacy/grant corrections; optional MFA and verified-email enforcement for database/API/storage.
- Backend identity/factor checks and fail-closed workspace challenge.
- Company disclosures, safe CSV exports, typed notification/export responses.
- Account closure stops if subscription cancellation cannot be confirmed.
- Remaining work tracked against the 21 September launch audit; no blanket completion claim.

## Verification

- 21 isolated access/export regression checks passed; fictional schema, actual migrations.
- 20 isolated scheduling checks passed; actual validator and conflict routine.
- TypeScript check and production build passed. Build's server/client security boundary check passed.
- Paid checkout now derives the appointment end from server scheduling rules; checkout holds and payment compensation remain outstanding and must be tested before live payments.
