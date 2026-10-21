# Settings improvements — 21 October 2026

The web settings hub now includes search, booking policies, website design, team access, professional connections, data/privacy and help. Existing settings URLs remain valid. Profile completion counts core business details rather than requiring optional social accounts and a logo.

Reliability changes include profile validation, calendar reconnect controls, retry states for failed loads, closure error handling and mobile layout, notification save serialisation, and refreshed MFA status. Failed hours loads cannot be saved as an empty week.

## Release requirement

Apply `supabase/migrations/20261021120000_atomic_settings_hours.sql` before releasing the web changes. It adds an owner-authorised transaction that saves split periods and legacy opening hours together. Do not release the new hours UI without this function. Applied to the production project on 21 October 2026; migration history was recorded and anonymous execution was verified to be denied.

## Verification

- Production build and the bundled security-boundary check passed.
- Five isolated Playwright tests passed: search/navigation/empty results; mobile hours/reconnect; explicit closure confirmation; notification load failure; hours load failure.
- Local PGlite execution of the migration passed checks for split shifts, legacy mirrors, all-closed schedules, invalid weekdays/times, overlaps, non-owner rejection and rollback when the legacy-table write fails.
- The isolated release was reconciled with current main (c3659be), preserving approved plan gates, calendar launch restrictions, delivery-review controls and MFA layout fixes. The full release build passed, including TypeScript, launch regressions, complete schema replay, recovery checks and security-boundary verification.

Run the browser regression tests with:

```text
npx playwright test tests/e2e/settings.spec.ts --project=public-chromium --workers=1
```

Browser tests use mocked Supabase data and block server-function calls. They do not certify hosted database permissions, Stripe transactions, billing changes, actual email/SMS delivery, MFA enrolment or external calendar OAuth. Those require configured service accounts and controlled integration tests. The production migration adds a function only; no customer schedules, subscriptions or customer records were modified. The pre-release Worker rollback version is db7b9877-e078-43d8-ba5d-61caaba89cc1.
