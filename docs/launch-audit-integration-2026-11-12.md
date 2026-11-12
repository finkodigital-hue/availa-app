# Launch audit integration — 12 November 2026

This change fixes reproduced booking, data, rent and session defects. It is not a claim that every line is defect-free, that the service is unhackable, or that operational/legal launch gates have been completed.

## Resulting behaviour

- Email confirmation/cancellation claims and changes a booking atomically; a failed database change leaves the link usable. Customer portal rescheduling uses a narrow identity-checked RPC without restoring direct private booking access.
- Ambiguous encoded database gateway paths are rejected before forwarding. Customer exports paginate rather than silently stopping at the provider's default limit. Consultation consent requires literal true; email matching treats wildcard characters literally.
- Import undo locks and validates the complete batch, changed rows and current foreign-key dependencies in one transaction. Legacy/untracked or changed imports fail safely. Cached clients cannot bypass undo using direct deletion or provenance removal. Authorised customer erasure remains separate and tested.
- Import times retain their actual 24-hour values; malformed stock numbers fail instead of silently becoming zero. Marketing checks current consent/current email, and stale queued recipients require review. Refunds requiring provider action are not blindly retried.
- Chair-rent entries preserve history, currency and period identity. Generation requires a retry ID, locks the relationship and handles month ends in the salon timezone. Old generators fail with a refresh instruction. Manual retries show the existing record's current status rather than claiming a second entry.
- Professionals control sharing; linked salons receive restricted busy-time information rather than full booking rows. Withdrawn membership/Studio access clears the shared display. Unlink retains rent history. Automated rent collection, automatic commission and renewed-agreement workflows are not introduced.
- Website sign-out/account changes cannot be overwritten by the initial session snapshot. Account changes retire the old query client and remount drafts; delayed old-account callbacks cannot populate the next account's cache.
- Native and web sessions share the correct key, preserve verified MFA/refresh state and resist late sign-out writes. Native exports use temporary cache storage; print opens the normal browser. The native SDK upgrade requires rebuilt binaries and actual device acceptance.

## Verification

Combined release must pass the website build and security/recovery checks, the actual-browser account-session and balance-checkout tests, migration replay and the mobile CI job. Tests use fictional records and inert/mock provider adapters. Passing them does not prove production provider delivery or physical-device behaviour.

Focused evidence includes 57 chair database assertions, 35 rent helper checks, 26 rent API checks, seven real PostgreSQL concurrency assertions, 12 shared-calendar cache checks, 29 import rollback assertions and 14 actual-browser account-isolation checks. Existing booking, refund, billing, notification, permission and export suites remain wired into the release checks. Native code/bundle scope and current SDK compatibility are documented in `mobile-readiness-audit-2026-11-12.md`.

## Database release order

Apply all five reviewed migrations together before the matching website:

1. `20261112233000_atomic_booking_confirm_cancel.sql`
2. `20261112233500_narrow_customer_reschedule.sql`
3. `20261112234000_harden_chair_rent_ledger.sql`
4. `20261112234500_atomic_import_rollback.sql`
5. `20261112235000_guard_imported_record_deletion.sql`

Immediately recheck migration history and absence of processing imports; use a current recoverable backup and one transaction. Record successful versions. Deploy promptly: old pages intentionally lose unsafe unlink/undo/generation behaviour and must refresh. Do not undo history protections or delete newly recorded data as a website rollback shortcut.

Verify the actual live revision, HTML/client assets, application/database health and effective grants afterwards. No live Stripe activation, real payment, customer message or public signup opening is part of this release.

## Remaining launch decisions and acceptance

- Fresh-sign-in sandbox refund; live Stripe activation/refund/payout acceptance only when separately authorised. Physical reader and commercial terms remain separate.
- Real invited-salon onboarding and terms acceptance; public signup remains closed until deliberately enabled.
- Actual Twilio sender/delivery/opt-out/cost checks, independent monitoring cadence and real alert delivery, assigned support coverage.
- Refresh the separate encrypted USB copy; prove independent recovery and reliable scheduled backup operation. The fresh local restore used Windows-protected credentials and does not prove hosted failover.
- Complete factual fields, approvals and signatures in the private legal pack; drafts have not been adopted or certified.
- Real iPhone/Android browser checks and native signed-build/device/store acceptance. Native SDK58 requires iOS16.4+; bundle exports are not installable builds.

Repository-wide lint still includes historical formatting/explicit-any debt. Automated inventory and tests are not an exhaustive manual review of all source/dependency lines.
