# Launch checks — 30 October 2026

The latest main revision inspected was `808b1c20c7d79b9d78a4830a0855b8fa417cf228`.

## Dependency patch

The fresh production dependency audit reported three affected packages (two high, one moderate). Updated the npm lockfile within existing manifest ranges: Seroval 1.6.9 → 1.7.5, Undici 7.30.0 → 7.30.1 and Vite 8.0.16 → 8.3.5, including Vite's resolved tooling dependencies. Regenerated third-party notices from the installed packages. The resulting `npm audit --omit=dev` reports zero known vulnerabilities. This is an advisory scan, not proof of exploitability or complete security.

References: https://github.com/advisories/GHSA-f86p-h4j2-7qgj, https://github.com/advisories/GHSA-xjj6-f33q-929c, https://github.com/advisories/GHSA-587h-7wmj-h5pm.

## Live observations

- Homepage/client bundle verification and health endpoint passed; configuration, Supabase and database reported healthy.
- Public link/metadata audit passed across 125 pages/assets.
- `/deployment.json`, including a cache-busted request, reports `c3659be6ca88be47984e52c236878cc12ca5b9b4`. However, the live entry bundle imports `settings-CcYtTWOI.js`, whose bytes match the locally retained settings release. The marker is insufficient evidence that the settings release is missing. Refresh and independently verify the marker during the next release.

## Validation and limits

The pre-patch full launch suite passed, including 169 migration replays, 96 full-schema role/MFA/storage assertions, 41 booking-request handler scenarios, 34 Terminal assertions, 88 scheduling/payment assertions, 50 balance checkout assertions, refund and better-time-offer tests. Recovery controls and encryption/tamper-detection tests also passed. Post-patch release-build outcome is recorded separately in the release evidence.

The post-patch `npm run build` also passed: TypeScript, all launch regressions, notices, recovery tests, client/server bundle generation and the security-boundary check covering 72 public tables. The build reported the existing Cloudflare assets-configuration override warning. Generated licence quotations retain their upstream whitespace.

These use isolated fictional databases/provider fixtures. No real charges, refunds or customer messages were generated. They do not certify live Stripe acceptance, physical readers, delivered SMS, independent USB passphrase recovery or complete real-salon onboarding.

Private evidence: `C:/bookzenvo/private-launch-records/launch-check-2026-10-30.log`, `public-audit-2026-10-30.log`, `dependency-audit-2026-10-30.json`, `dependency-audit-patched-2026-10-30.json`, `security-build-2026-10-30.log`.
