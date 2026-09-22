# Website launch remediation — 22 September 2026

Authorised scope: fix, test and deploy the website, including mobile-web layouts. Native apps deferred by the founder. Stripe remains sandbox; the founder's real-card test is the final step when they return. No paid Twilio upgrade authorised yet.

Company details supplied: BOOKZENVO LTD, SC902170, registered in Scotland, Pinefield, Tomich, Cannich, IV4 7LY; help@bookzenvo.com.

## Live configuration

- Supabase Confirm email enabled on 22 September. Existing four confirmed accounts still require provenance review; changing the setting does not reverify them.
- Production dashboard reported no backups. Backup/restore evidence remains a launch requirement.
- Access migration 20260922001000 applied successfully. Live read-only probes: private blocked-time columns return 401; safe availability view returns 200; auth settings report mailer_autoconfirm=false.
- Scheduling migration 20260922002000 applied successfully. Anonymous bookings now validate business-local hours, holidays, repeating staff schedules, service assignments, blocks and payment requirements.

## Website deployment

First batch deployed and verified at revision af7de6756499eec73777cdb12406be03f76d00ba (Cloudflare version 8e6823ca-2347-405c-88dc-99e459f981a0). Homepage/assets/health passed; live terms/privacy include the supplied company name, number and address. Migrations 01000, 02000 and 03000 applied successfully through Supabase SQL Editor in transactions.

- Tenant privacy/grant corrections; optional MFA and verified-email enforcement for database/API/storage.
- Backend identity/factor checks and fail-closed workspace challenge.
- Company disclosures, safe CSV exports, typed notification/export responses.
- Account closure stops if subscription cancellation cannot be confirmed.
- Remaining work tracked against the 21 September launch audit; no blanket completion claim.

## Verification

- 21 isolated access/export regression checks passed; fictional schema, actual migrations.
- 20 isolated scheduling checks passed; actual validator and conflict routine.
- TypeScript check and production build passed. Build's server/client security boundary check passed.
- Second batch: all 80 isolated checks passed, type checks passed, production build passed, security boundary checks cover RLS on 55 public tables.
- Migrations 04000–06000 applied successfully: atomic reschedule tokens, reusable Studio checkout attempts, appointment checkout holds, shared booking integrity guard, payment-issue/refund reconciliation locks.
- Paid checkout snapshots the service price/duration and holds the slot. Immediate card checkout expires before its reservation. A failed fulfilment is tracked; an unresolved held booking enters idempotent refund processing after 15 minutes. Sandbox end-to-end proof is still required before live payments.
- Studio subscriptions reconcile via signed platform webhooks and fresh Stripe state; the return page remains a fallback. Anonymous booking consent cannot overwrite an existing withdrawal or use a phone match to subscribe a different email.
- The build command now requires the type/security regression checks; GitHub receives the same release check workflow.

## Provider evidence and remaining gates

- Sandbox Stripe Connect endpoint now receives checkout completion and refund updates. A separate platform endpoint receives Studio checkout and subscription lifecycle events. Its signing secret is configured on Cloudflare. Signed ignored-event probe returned 200; invalid signature returned 400. This is wiring evidence, not a completed Stripe payment journey. No live money has been charged.
- Official Stripe references checked: https://docs.stripe.com/api/checkout/sessions/create (checkout expiry limits), https://docs.stripe.com/billing/subscriptions/webhooks and https://docs.stripe.com/webhooks (subscription lifecycle/retry handling).
- Mobile browser review, live delivery/provider setup, production backup/restore, historical identity review, legal/operator evidence and integrated sandbox flows remain open. No claim of an unhackable or fully launch-ready service.

## Further verified fixes

- 101 regression assertions now pass: access/export 21, booking/holds/customer portal 43, verified identity 7, Studio billing 13, business day boundaries 10, refund recovery 7. TypeScript and production build pass.
- Migration 07000 applied successfully to production: the authenticated customer reschedule path now enforces public availability and unchanged service duration/gaps. Direct customer edits still cannot bypass the dedicated reschedule path.
- Failed refund attempts remain durably unresolved and are reported in the scheduled-job result/logs; they no longer abort other refunds or reminders. Pending/failed refunds are never marked successful. Manual provider handling/alert delivery and fairness for a backlog larger than three unresolved refunds remain launch gates.
- Mobile improvements and UK-midnight dashboard date fix deployed at revision 5e67091102ba1e4321165341055c81f3b7be588a and verified in the signed-in production website at 390px.


## Final evidence from this implementation pass

- Portal/refund batch deployed: c4c2ff8, Cloudflare fe2d69cd-54ce-4e92-8750-282c7c26d79c. Production public-page/link/metadata audit passed all 116 targets after fixes.
- Companies House directly verified in the browser on 22 September: BOOKZENVO LTD, SC902170, active, incorporated 9 September 2026; registered office Pinefield, Cannich, Beauly, Scotland, IV4 7LY. The legal-page address now follows that official wording. Source: https://find-and-update.company-information.service.gov.uk/company/SC902170 . First confirmation statement due 22 September 2027; first accounts due 9 June 2028.
- Gitleaks v8.30.1, official Windows binary SHA256 d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e verified against release checksum, scanned all available Git refs: 500 commits, ~5.47 MB. Three matches: two historical public Supabase anon JWTs; one prose false positive in the recovery guide. No confirmed private credential found in this scan; this is not proof that all secrets are safe. Redacted report retained outside the repository. Source: https://github.com/gitleaks/gitleaks .
- DNS read-only evidence: Cloudflare mail-routing MX and SPF present; Resend DKIM selector present; _dmarc.bookzenvo.com returns NXDOMAIN. This does not prove help@ routing or sender delivery. DMARC policy/monitoring and controlled inbox tests remain open; no DNS or mailbox changes made.
- Public customer form checked at 320/430/768px. See the mobile review for evidence and limitations.

## Reliability and usage follow-up — 23 September

- Replaced notification pre-send booking markers with database leases, immutable email retry requests, bounded backoff and manual review for ambiguous SMS. Signed callbacks tolerate delayed events and preserve confirmed delivery. Private retry payloads have restricted access and scheduled expiry.
- Added atomic per-business AI/SMS safety ceilings and fail-closed server checks. Refund recovery now rotates through a backlog and reuses recorded refund IDs; failed refunds require review.
- Added delivery/refund issue counts to the existing authenticated monitoring endpoint and review status to notification settings. A historical delivery needs provider review; no blind resend performed.
- All 150 isolated regression assertions, type checks, production compilation and the 58-table security boundary check pass. Three new migrations applied successfully; production grants/RLS verified read-only. Full provider journeys, alert receipt, independent security review and backup restoration remain open.
- Detailed procedures and limitations: [notification and usage operations](notification-and-usage-operations.md).
