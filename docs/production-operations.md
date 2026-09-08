# Production operations checklist

This page separates repository automation from controls that only the account owner can enable. Never copy secrets into issues, workflow output, commits, or this document.

## Automated in this repository

- **Production uptime** checks the HTML shell, fingerprinted browser bundle, Supabase Auth, and the Supabase database API every 15 minutes. On each push to `main`, it also waits for the exact commit marker before probing health, so an older healthy deployment cannot produce a false pass.
- **Production error alerts** fails when at least five uncaught browser errors arrive in a 20-minute window. A failed workflow is the alert signal.
- `npm run verify:production` performs the same release smoke test on demand.
- `npm run verify:recovery-controls` prevents accidental removal of the local-only restore guardrails.

## One-time owner setup

1. Generate a random `MONITORING_SECRET` of at least 32 bytes. Store the same value as an encrypted Cloudflare Worker secret and as a GitHub Actions repository secret. Do not use a Supabase key for this purpose.
2. In GitHub, enable Actions failure notifications for the repository and confirm they reach at least two maintainers. Manually run **Production uptime** and **Production error alerts** after the next deployment.
3. In Supabase, confirm successful scheduled database backups, retention, and Point-in-Time Recovery against the RPO/RTO in `backup-and-recovery.md`. Supabase backup availability and PITR are plan/dashboard controls and cannot be safely inferred from source code.
4. Configure an encrypted, access-separated daily copy and inventory for both `business-assets` and `business-public-assets`. Supabase database backups do not include Storage objects.
5. In Cloudflare, enable Worker exception-rate and availability notifications to at least two maintainers. Keep deployment rollback available and confirm the production custom domain points at the intended Worker.
6. In GitHub, require the production build/checks on `main` before merge. In Cloudflare, verify Git deployment is connected to `main` and record the deployed commit after releases.

## Quarterly recovery evidence

Perform the disposable local restore rehearsal in `backup-and-recovery.md`. Record the selected recovery point, checksum, restore duration, core row-count checks, Storage sample checks, achieved RPO/RTO, reviewer, remediation, and next rehearsal date. Store this evidence in an access-controlled operations system, never in the repository if it contains customer or infrastructure details.

## Alert response

For an uptime failure, check Cloudflare deployment/logs and Supabase status before changing production. For an error-volume alert, inspect recent `client_errors` rows in Supabase, group by message and URL, and avoid copying personal data into tickets. Silence an alert only after documenting its cause; do not raise the threshold merely to hide an unresolved regression.
