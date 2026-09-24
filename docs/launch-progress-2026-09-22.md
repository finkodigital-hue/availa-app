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

## Balance payment safety — 23 September

- Removed automatic saved-card balance charging. Customers approve the remaining balance through Stripe Checkout; stale clients cannot initiate the old off-session charge.
- Added private, immutable checkout attempts, stable provider idempotency, fresh session retrieval, payment identity/currency validation and manual review for uncertain attempts. Repeated completed payments reconcile without adding another ledger charge.
- All 200 isolated regression assertions, TypeScript, production build and the 59-table security boundary check pass. Migration 20260923004000 applied successfully to production. No customer charge or message was initiated.
- Integrated sandbox payment/SCA journeys, legacy payment reconciliation and production restore evidence remain open. See [balance payment safety](balance-payment-safety.md) for scope and limitations.

## Scheduling and complete application migration replay — 24 September

- Bookings and paid holds preserve buffer snapshots. Collision checks and public previews include preparation/cleanup without filling processing gaps. Future manual creation, drag/resize/undo and restoration enforce working hours, holidays, time off and staff/service availability at the database boundary.
- Corrected the old cancellation deadline's interference with authorised reception work. Customer deadlines and provider-field protections remain enforced.
- All 123 application migrations replay locally, with 45 full-application-schema role/invitation/export/MFA/storage-policy assertions and two metadata-backfill assertions. Full build passes 290 assertions, TypeScript and 59-table boundary checks. Auth/Storage and external services are fixtures; full Supabase and multi-connection staging evidence remain open.
- Production preflight: no negative service buffers or active unpaid holds; 323 future buffered appointments. All 21 existing buffered conflict pairs belong to the explicitly fictional demo salon. No appointment was moved/cancelled. Three scheduling migrations applied successfully after a transactionally rolled-back first attempt exposed the old change-window rule; the corrected metadata backfill is regression-tested.
- Details and limits: [scheduling and schema verification](scheduling-and-schema-verification.md).

## Public source protections — 24 September

- Added atomic source counters for booking/Checkout, gift cards, waitlist and website authentication. Daily keyed source identifiers avoid storing raw IP addresses in the counter table; bounded cleanup expires them. Counter failures stop the protected action.
- Validated free booking now runs through the server credential after the source check. A separate post-deployment permission migration closes direct anonymous/member booking and waitlist RPC access; discovery remains public. Rollout order is mandatory.
- Full local build passes 326 assertions, all 125 application migrations, TypeScript and the 60-table boundary check. Real source-spam/load tests, native Supabase auth limits and Cloudflare volumetric controls remain separate evidence.
- The preceding scheduling release is live at babe51589569730b95fce1732c226566b8d166d3; all three release checks and marker passed. Mobile public service/staff/time/details screens reached at 390px with 375px content/scroll width and no page overflow; no submission made.
- Limits, privacy assumptions and rollout: [public request protection](public-request-protection.md).

## Payment ledger follow-up — 24 September

- Source protections are live at 5c7e1407e079137d36a76ed1eda103db3b5d153f; all three release checks and the exact marker passed. Direct public/member booking and waitlist writes were then revoked. An inert unknown-auth-route probe confirmed the server source counter without creating an identity or sending mail.
- Gift redemption now updates the due amount and validates replay identity, currency, expiry and unresolved balance checkouts. Confirmed partial refunds reconcile once against the original charge. The website retains partially refunded charges as refundable and reports submission accurately.
- Added 25 full-schema ledger, eight balance-calculation and 15 signed-handler assertions. The handler supports dashboard-originated booking refunds without requiring metadata and rejects wrong accounts/identities. Database migration 20260924003000 applied successfully. Gift-purchase refunds and late refund failures remain open; see [payment ledger verification](payment-ledger-verification.md).

## Gift purchase refunds — 24 September

- Confirmed gift-purchase refunds remove unspent value once and retain a refund/credit ledger. Refunds exceeding remaining credit create owner-visible and monitoring review flags, with remaining credit removed. No automatic customer charge or invented debt is created.
- Added 18 full-schema assertions and four signed-handler assertions. All 127 migrations replay, with 61 public tables checked. Provider delivery, late failures and spent-credit operator reconciliation remain open.
- The preceding booking-refund release is live at 57af0c1a7c504f075cd0de23f8a9618b8dfa00e1, with all checks and marker verified. Its sandbox webhook now includes refund.created. See [payment ledger verification](payment-ledger-verification.md).
