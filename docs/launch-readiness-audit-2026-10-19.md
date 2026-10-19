# Bookzenvo launch readiness — 19 October 2026

Target decision date: 22 October 2026. **Status: not yet approved for an unrestricted public launch.** This is a dated evidence snapshot, not a claim that every provider journey has been exercised.

## What was checked today

- Fetched the latest `origin/main` (`ac115199dd8e50ac2aee43a64b9a1da9947f9485`, PR #157) into an isolated worktree. The older local working branch has uncommitted files and was not changed.
- Production `deployment.json` reports that exact revision. `/api/health` reports application configuration, Supabase and database healthy. The read-only launch audit passed 120 public pages and assets.
- The unmodified main branch passed the full local production build, including typecheck, 166 migration replays, 72 RLS tables, payment/booking/notification regression suites, backup safeguards and server security-boundary checks.
- The locked main-branch dependencies contain five **critical** audit findings from one TanStack Start reflected-XSS advisory, GHSA-qx66-fv34-fjm8. No exploitation has been observed or tested. Patch branch `codex/patch-tanstack-start-20261019` updates Start and its matched router packages; its full build passes and `npm audit` reports zero known vulnerabilities. Its local public browser tests passed 11, skipped 3 without a live salon fixture, and had one intermittent FAQ accordion failure which passed on a focused rerun. The patch must be merged, deployed and verified on the live revision before launch.
- Existing live QA evidence includes a founder-confirmed email confirmation, reschedule and cancellation flow. That does **not** verify live SMS, card-reader collection, every payment/failure path or an independent accessibility review.

## Next three days: release gates

1. **Today — patch security and confirm deployment.** Merge the TanStack patch after CI, verify the new `deployment.json` revision, health endpoint and public smoke audit. Review browser-error monitoring for the patched release.
2. **Today/tomorrow — one controlled pilot salon.** Founder and Jakob must select a fictional or explicitly consenting pilot workspace and run the complete phone journey: booking, staff diary, confirmation, payment/deposit if enabled, reschedule, cancellation, refund and rebooking. Record each result. Do not use imported customer contacts for testing.
3. **Before promising SMS — activate and test Twilio.** The last provider check showed a trial account without an approved production sender. Upgrade/configure the sender, set a spend cap, then run one authorised handset test and confirm delivery. If this cannot be completed by the target date, launch only with SMS clearly unavailable; do not silently imply it works.
4. **Before taking real card payments — live Stripe decision.** Complete a small authorised live charge/refund, webhook and reconciliation check for the exact product journey. Confirm whether a physical smart reader is part of day-one scope; existing code and fictional tests do not prove a connected reader in a salon. If not verified, exclude it from day-one claims.
5. **Before holding live salon data — recovery and compliance.** Perform an off-device encrypted backup and a witnessed restore into an isolated environment; confirm owners, access and monitoring response. Resolve the existing ICO/company/IP/legal checklist and review current Supabase database advisers and backup/upgrade plan. A passing local restore test is not a production recovery drill.
6. **Before a public announcement — real human review.** Test key tasks on physical iPhone and Android, keyboard and screen reader, and have at least one owner who did not build Bookzenvo complete booking, checkout and switch/import tasks. Record confusion or defects and fix launch-blocking ones.

If a gate is not evidenced, reduce the initial release scope rather than marking it complete. The 12 October audit in this folder has the fuller outstanding checklist and historical evidence; this document supersedes its dependency and deployment snapshot.
