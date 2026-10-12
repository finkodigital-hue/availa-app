# Bookzenvo launch-readiness audit — 12 October 2026

This is an engineering and operational readiness record for the website release. It is not legal advice, a penetration-test certificate or authority to process live customer data. Native mobile applications are outside this release.

## Release decision

**Website code: deployed and verified.** Pull request #155 was merged, Cloudflare served the merged revision, and both the repository release checks and production uptime check passed.

**Public launch: not yet approved.** The remaining blockers require provider activation, physical evidence, company records or professional review that source code cannot supply.

## Source and environment reviewed

- Repository: `finkodigital-hue/availa-app`
- Baseline: `origin/main` at `5848b31`
- Isolated audit branch: `audit/full-launch-20261012`
- Production: `https://bookzenvo.com`
- Production database project: `repamfxdbsbotkonhxmj`
- Audit checkout used a fresh locked `npm ci`; no production secret was copied into the repository.

## Findings fixed in this audit

1. **Critical and high dependency advisories.** The locked tree contained vulnerable Seroval releases and `source-map-js@1.2.1`. The lockfile now resolves Seroval to `1.6.9` and `source-map-js` to `1.2.2`. A fresh install and both full and production-only audits report zero known vulnerabilities.
2. **Broken public booking-page image.** `/book/pasha-hair` referenced a deliberately removed local demonstration image and showed a broken-image icon on mobile. User-configured hero, gallery, about, staff and storefront images now fail to a neutral surface or remove the failed decorative image instead of exposing a broken control. The stale Pasha page choice should still be replaced with an authorised real image before it is presented as a live salon.
3. **Stale browser assertion.** The favicon smoke test expected an old unversioned URL even though production deliberately cache-busts that asset. The test now accepts the intended query string.
4. **Lint artifact crash.** ESLint now ignores Playwright report folders, so a missing or newly-created test output directory cannot crash file discovery.
5. **Minor waitlist lint defect.** Read-only query results are declared immutable while the backward-compatible request result remains reassignable.
6. **Third-party notices.** The production notice inventory was regenerated for the repaired dependency tree and records 298 production package/version entries.

## Verification completed

### Database, tenancy and security

- Replayed all 165 application migrations in order.
- Checked RLS/security boundaries on all 72 public tables.
- Passed 95 full-schema assertions covering owners, staff roles, invitations, customer exports, MFA-related controls and Storage policies.
- Passed 40 database-function access assertions, including private notification-trigger delivery.
- Passed the server identity, protected payment-field, public projection and asset-path regression checks.
- Reviewed all 27 API route files. Privileged routes use authenticated sessions, constant-time internal bearer checks, signed provider events, signed customer tokens or bounded public request controls as appropriate.
- Safe production probes returned 401 for unauthenticated calendar-sync, reminder-cron, chat, stock-scan and page-AI requests. The confirmation endpoint returned its deliberately non-enumerating 204 response to an empty request.
- A working-tree credential scan found configuration names and documented preview/test placeholders, but no committed live Stripe key, Twilio token, private key or Supabase service credential.
- Live responses include CSP, one-year HSTS, frame denial, MIME sniffing protection, strict-origin referrer policy and disabled camera/geolocation/microphone permissions.

The current CSP still allows inline scripts and styles because of the present TanStack hydration and styling path. Removing those allowances requires a nonce/hash design and is a security hardening item; it is not represented as completed by this audit.

### Booking, payments and recovery logic

- Passed 88 scheduling, token, reservation and payment assertions.
- Passed 50 balance-checkout identity, locking, recovery and access assertions.
- Passed 34 Stripe Terminal database, idempotency, balance-lock and access assertions.
- Passed full-schema gift purchase, redemption, refund-ledger and adverse-refund review suites.
- Passed cash receipt, daily takings, stock reversal, report, subscription, booking-return and payment-recovery suites.
- Payment tests used fictional data and mocked/sandbox providers. They did not create a live charge.
- Backup tooling passed encryption, authentication-tag, tamper-detection and destructive-target guard tests.

### Live website, mobile and accessibility

- Production health, HTML shell and fingerprinted client bundle returned successfully.
- The public crawler checked 120 pages/assets, required legal identity, canonical links, sign-in `noindex` and image alternatives.
- Read-only production browser tests passed 9/9.
- Local public browser tests passed 12/12 runnable tests; three booking-flow tests were skipped because the fresh checkout did not contain a seeded salon.
- The 320-pixel sign-in, public navigation, mobile menu and narrow-page overflow checks passed.
- A signed-in production session rendered dashboard, calendar, bookings, customers, services, staff, payments, stock, reports, settings, consultations, page builder and import at 470 pixels with no horizontal overflow or browser warnings/errors.
- Live accessibility heuristics found one visible `h1` on the normal pages, no missing `alt` attributes, no duplicate IDs and no non-inline controls below the WCAG 2.2 24-pixel target size. The page-builder preview contributes an additional preview heading by design.
- Visual checks covered the landing page, signed-in dashboard, payments, page builder and the Pasha booking page.

Automated checks do not replace a human keyboard-only, 200%/400% zoom, named screen-reader and colour-contrast walkthrough.

### Build and code quality

- TypeScript strict checking passed.
- The complete production build, recovery-control tests, Cloudflare preparation and security-boundary verification passed after the fixes.
- The focused lint pass over changed files has zero errors.
- Repository-wide lint remains historical technical debt: 7,798 findings, of which 7,318 are auto-formatting findings; after excluding formatting, 460 are explicit `any` typing findings, with a small number of React hook warnings. This does not currently block the tested build, but lint cannot yet be used as a clean release gate.
- The largest shared browser chunk is about 584 KB before transfer compression. Route splitting is present, but bundle reduction remains a performance improvement for slower phones.

### Release evidence

- Pull request #155 passed the independent website release workflow and was squash-merged to `main`.
- Cloudflare served the merged functional revision `20b5672a5f33db8fbef9bc8bafa22dd3dddc63af` before this record-only follow-up.
- The exact-revision production health check passed.
- The post-deployment crawler rechecked all 120 public pages and assets.
- The post-deployment public browser suite passed 15/15, including the complete non-mutating Pasha booking journey at desktop and phone widths.
- GitHub's production uptime workflow passed, and a fresh 320-pixel visual review confirmed that the removed Pasha image no longer exposes a broken-image control.

## Ordered launch blockers

1. **Finish the real salon pilot.** On actual customer and salon phones, complete the owner booking, public booking, confirmation, reschedule/cancel, check-in and closing/reconciliation journeys. Replace fictional Pasha content and stale photo choices with authorised, accurate salon information. Record a signed go/no-go result.
2. **Activate Stripe live mode last, as planned.** Finish the platform and connected-salon identity checks, live webhook configuration and bank details. Make one authorised low-value live payment, verify the local ledger and payout destination, then refund it and confirm the final provider status. Do not infer live readiness from sandbox evidence.
3. **Choose the launch card-present scope.** If physical card payments are promised, obtain a Stripe-supported GB reader such as a currently supported WisePOS E or S700/S710, register its location and complete payment, cancellation, decline and refund tests. The Fresha Castles SATURN1000 is not a reusable Stripe Terminal reader. Keep Tap to Pay out of the website launch; it needs a native mobile SDK and provider/Apple requirements.
4. **Either activate Twilio properly or keep SMS visibly disabled.** The last verified account record was a trial with no sender. Upgrade, acquire/approve a UK-capable sender, set budget alerts, review provider retention/DPA settings and send one authorised delivery/callback/opt-out test. Email-only launch is acceptable if every SMS toggle remains off and public wording stays accurate.
5. **Close the recovery gap before irreplaceable salon data.** The encrypted local daily backup and an earlier restore rehearsal exist, but the archive is on the same computer. Add an encrypted access-separated/off-device copy and complete a dated restore rehearsal for a current generation, or buy and verify an adequate managed backup/PITR plan while separately protecting Storage.
6. **Complete ICO registration and payment at release.** The prior self-assessment returned Tier 1; retain the receipt and publish the registration number only after it is issued and verified.
7. **Complete company/legal records.** Obtain and review the grant award/application/conditions and conference obligations; complete the expenditure/evidence schedule; sign and witness founder/contributor IP assignments; and obtain qualified review of the subscription terms, DPA/processor terms, liability, refunds, special-category data, minors/guardians and salon marketplace split.
8. **Finish data-protection operations.** Approve the retention schedule, records of processing, subprocessor/international-transfer register, DPIA for consultation/health data, breach response, data-subject identity checks and notice-and-takedown procedure.
9. **Reauthenticate and record hosted controls.** Recheck the Supabase Security and Performance Advisers after the final migrations, record the intentionally reviewed public projection findings, verify Auth settings and document the actual backup plan. Today’s dashboard check stopped at its two-factor challenge.
10. **Confirm monitoring reaches people.** Verify GitHub production-check notifications and Cloudflare availability/exception alerts reach at least two maintainers. Observe a real reminder for an authorised pilot appointment without putting recipient data in the repository.
11. **Run the human accessibility pass.** Use keyboard only, 200% and 400% zoom, Windows Narrator or NVDA, and contrast checks on the landing, sign-in, public booking, portal, calendar, booking detail, payments and consultation flows.

## Final release-day sequence

1. Freeze content and the release commit.
2. Reconcile grant, ICO, legal, provider and pilot evidence; name the two people approving launch.
3. Confirm a current encrypted backup and access-separated copy.
4. Deploy the exact approved commit and verify its revision.
5. Run the production health check, 120-target launch crawler and read-only browser suite.
6. Complete the authorised live Stripe payment/refund and, if in scope, physical-reader test.
7. Verify one real booking and its intended email/reminder outcome.
8. Check monitoring, support inbox and rollback access.
9. Record go/no-go, time, commit and any accepted exception with an owner and expiry.

No audit can prove that a service is impossible to hack. This review materially reduces known risk and records the remaining controls; production security still depends on provider configuration, secret hygiene, monitoring, patching, backups and incident response after launch.
