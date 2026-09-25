# Tasks

Launch readiness reviewed 2026-09-24. A checked item needs evidence, not just passing code checks. Do not test with imported customer data or send customer messages without an approved pilot.

## Active

- [ ] **Define the first launch scope** - Decide which features will be advertised and enabled: core bookings, payments, email, SMS, consultations, reviews and AI. Keep unverified features off the launch promise.
- [ ] **Complete a fictional customer booking end to end** - Verify public booking, one calendar entry, correct staff/local time, confirmation, cancellation and rescheduling on desktop and a real phone; no imported customer data.
- [ ] **Complete Stripe sandbox payment journeys** - Cover deposit, full amount, balance, SCA, abandoned checkout, expiry, duplicate webhooks, partial/full refunds and gift-card interactions; record evidence without charging real customers.
- [ ] **Confirm production migration parity** - Compare deployed migration history with main, especially 20260924004000_gift_purchase_refunds.sql; verify grants and RLS after deployment.
- [ ] **Test controlled outbound email and help inbox** - Use approved QA addresses for booking, reset, reminder, review, waitlist and support replies; confirm provider acceptance and inbox receipt, then configure/check DMARC.
- [ ] **Decide and test SMS scope** - If launch includes SMS, check consent, Twilio sender, actual QA delivery/callbacks, costs and suppression; otherwise leave it disabled and remove launch claims.
- [ ] **Prove database and Storage backups with a restore rehearsal** - Confirm production backup/PITR settings and encrypted copies of both asset buckets; restore to a disposable target and record RPO/RTO evidence.
- [ ] **Verify monitoring reaches two maintainers** - Test uptime, browser-error, failed-delivery and unresolved-payment alerts, plus the on-call/fallback response.
- [ ] **Review real, demo and historic accounts** - Confirm identity provenance, demo labels, testshop/Pasha data boundaries and outbound suppression; do not message imported contacts.
- [ ] **Run final live release audit** - After the final deployment, verify exact commit, homepage, sign-in, public booking, health, links, legal pages, metadata, robots and sitemap from a connected machine.
  - The 2026-09-25 local development-server audit passed 79 pages/assets. `vite preview` currently returns 500 on this Cloudflare build because it looks for `dist/server/server.js`; fix or replace that preview path before using it for release smoke tests.
- [ ] **Run independent security and dependency review** - Review secrets, role boundaries, provider callbacks, rate limits and current dependency advisories; today's npm audit could not reach the registry.
  - Read-only browser tests now block every app-origin write, including new endpoints. Dependency advisory retrieval is still blocked by registry access; no clean audit is claimed.
- [ ] **Complete real-device and accessibility review** - Physical iPhone/Android, desktop browsers, keyboard, screen reader, 200%/400% zoom, contrast and form errors; fix material issues.
  - Local mobile-menu and 404 browser checks pass. The 404 and error fallback now provide a main landmark; physical devices and assistive technology remain untested.
- [ ] **Measure launch-page performance** - Check mobile page speed and resolve severe bottlenecks; the build currently warns about large bundles.
  - Desktop favicon now uses the existing 31 KB `.ico` instead of the 539 KB PNG; full page-speed and bundle measurements remain outstanding.
- [ ] **Run a consented salon pilot with a fallback diary** - Track duplicate/lost appointments, incorrect times/messages/payments, staff friction and support incidents; use the pilot stop criteria.
- [ ] **Check every public claim against enabled features** - Pricing, plans, payments, AI, reminders, reviews, integrations and card machines must match what actually works.
  - Initial code-to-copy matrix: `docs/launch-claims-audit-2026-09-24.md`. FAQ now calls £22 Studio **planned** pricing. Production/provider proof and founder launch-scope decisions are still needed.

## Waiting On

- [ ] **Legal review of terms and salon contracts** - For founders and a qualified UK solicitor: operator disclosures, subscriptions, refunds, marketplace responsibilities, liability and consultation/guardian wording.
- [ ] **Complete UK data-protection decisions** - For founders/privacy adviser: ICO fee assessment, processing records, salon DPA, subprocessors, transfers, retention, rights-request and breach processes, Article 6/9 bases and DPIA for health data.
- [ ] **Confirm marketing and review compliance** - For founders/legal reviewer: email/SMS opt-in and unsubscribe, imported contacts, genuine-review provenance, moderation and displayed ratings.
- [ ] **Document rights for built-in assets** - For founders/designer: provenance or licences for photographs, fonts, icons and marketing material; publish a takedown route.
- [ ] **Founder-approved final live payment check** - Only after sandbox evidence and explicit approval: a small real-card charge and refund on an authorised account.

## Someday

- [ ] **Build Stripe Terminal in-salon card payments** - Separate feature; current main supports online Checkout/payment links, not a connected reader. Follow docs/in-salon-card-payments.md and use a simulated reader before hardware.
- [ ] **Finish and validate assistant improvements** - Separate codex/assistant-reviewed branch; test a real model conversation and database-dependent reporting before merge.
- [ ] **Finish and validate appointment waitlist** - Separate codex/practical-ai-assistant branch; end-to-end save, owner privacy and cancellation matching remain unproved.
- [ ] **Enable optional calendar provider sync** - Only after provider configuration and controlled OAuth/outbox tests; native app and extra integrations are not core launch gates.

## Done

- [x] ~~Run the public link and metadata audit locally~~ (2026-09-24) - 78 local pages/assets passed. This does not replace the final live-domain audit.
- [x] ~~Run the main-branch build and isolated launch checks~~ (2026-09-24) - Build passed; 127 migrations replayed and security checks covered 61 public tables. No real provider journey was exercised.
- [x] ~~Add safe public-page browser smoke checks~~ (2026-09-24) - Three local browser tests passed for legal/FAQ/help navigation, mobile menu and custom 404, with mutation requests guarded. This does not prove the live site or real-device accessibility.
