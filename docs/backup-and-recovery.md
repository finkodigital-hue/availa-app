# Backup and recovery runbook

## Safety boundary

Never restore into the production Supabase project. Recovery is rehearsed in a new or disposable local project first. Do not paste database passwords, service-role keys, backup contents, or signed URLs into tickets, logs, commits, or chat. Keep backups encrypted, access-controlled, and outside this repository.

The repository restore helper rejects every non-local hostname, defaults to a plan-only run, rejects system databases, requires names beginning with `bookzenvo_restore_`, and requires the disposable database name to be typed back before execution. These checks reduce mistakes, but a local tunnel can still point at a remote system. Verify the target independently before executing a restore.

## Supabase backup configuration

### Verified production state — 28 September 2026

- Project: `repamfxdbsbotkonhxmj` (`chairly project`, production branch).
- Region: `eu-west-1`, shown by Supabase as West EU (Ireland).
- Organisation plan: Free.
- Scheduled-backup screen: **“Free Plan does not include project backups.”**
- Point-in-Time Recovery: not available on the current plan.
- Actual managed recovery window: none. Do not describe the project as backed up.

This is an availability and recovery launch blocker before accepting irreplaceable
salon data. It does not require an immediate purchase while the site remains in
controlled testing. Before real salon data is accepted, either upgrade to a plan
with managed backups or complete, encrypt and restore-test an independent database
and Storage export. Record the chosen owner, storage location, frequency and first
successful restore. Source files and migrations alone do not recover customer data.

### No-cost Windows backup path

The repository includes a local fallback for the current Free-plan period:

- `scripts/setup-local-production-backup.ps1` asks for the production database
  password and a dedicated Supabase secret key (or legacy service-role key) without
  echoing them. It builds the verified Ireland session-pooler connection locally, so
  the operator does not edit a connection URL. Windows DPAPI protects both for
  the current Windows account; neither secret is written to this repository.
- `scripts/run-local-production-backup.ps1` creates a PostgreSQL custom-format dump,
  copies every object from `business-assets` and `business-public-assets`, encrypts
  both archives with AES-256-GCM, verifies their authentication tags and checksums,
  and removes the plaintext staging files.
- A Windows Scheduled Task runs the job daily at 02:30 and starts a missed run when
  the computer next becomes available. Daily generations older than 35 days expire.
- Setup asks for a recovery passphrase and derives the encryption key with scrypt.
  Save that passphrase in the company password manager. Each generation includes
  non-secret key-derivation metadata so it can be recovered after loss of the Windows
  account by passing that file to `decrypt-production-backup.ps1 -RecoveryMetadata`.
- Files are stored under `C:\bookzenvo\private-launch-records\backups`, outside the
  repository. This first local copy reduces the immediate data-loss gap, but it is
  not access-separated from the computer. Add a separately controlled encrypted copy
  before treating the 35-day archive as resilient to theft, disk failure or malware.

Run setup from PowerShell while signed into the Windows account that will own the
scheduled task:

```powershell
& .\scripts\setup-local-production-backup.ps1
```

The setup performs the first backup immediately. A successful generation contains
`database.dump.bzenc`, `storage.zip.bzenc`, `key-recovery.json` and a non-secret
`backup-metadata.json`.
The metadata must show both encrypted checksums and the console must report that the
backup completed and verified. Use `decrypt-production-backup.ps1` only into a
disposable recovery directory, then follow the local restore rehearsal below.

In the Supabase dashboard, document the production project's current plan and confirm the backup screen shows successful scheduled database backups. Enable Point-in-Time Recovery where the plan and recovery objectives require it. Dashboard database backups do not include Storage objects; protect both `business-assets` and `business-public-assets` separately.

Recommended baseline:

- Database: daily managed backup, with Point-in-Time Recovery for production when available.
- Storage: daily inventory plus encrypted object copy to a separate access boundary and lifecycle policy.
- Configuration: migrations, bucket definitions and policies remain versioned here; secrets remain only in the deployment secret stores.
- Monitoring: review failed backup/copy jobs daily and perform a restore rehearsal at least quarterly.

Record evidence for every check: UTC time, project reference, backup/PITR status, storage-copy status, reviewer, and the next rehearsal date. Do not record credentials.

## Recovery objectives and retention

Start with an RPO of 24 hours and RTO of 8 hours; tighten these when customer commitments require it. The target is 35 days of daily recovery points and 12 months of monthly encrypted archives, subject to the organisation's legal basis and retention schedule. This target is **not met by Supabase Pro's seven-day managed-backup window alone**: it requires a separately operated, encrypted and restore-tested archive. Until that exists, record the shorter actual recovery window rather than claiming this target has been met. Do not retain customer data merely because a backup exists: expire backup generations consistently, and document how erasure requests age out of immutable backups.

Owner workspace closure is recoverable for 30 days. Closing hides the public business and cancels billing, but retains database rows, authentication and Storage. A permanent purge is never automatic in application code: an operator must confirm the deadline has passed, the owner has not cancelled, a usable backup predates the purge, legal holds are clear, and the exact business ID and both Storage prefixes have been reviewed.

## Owner exports

Settings → Account → Workspace data downloads a versioned JSON export. It contains the business's relational records and a path-only Storage manifest. It excludes authentication internals, provider credentials, Vault identifiers, diagnostic logs, signed URLs, and Stripe identifiers. Client-list CSV and individual customer data-request exports remain available for their narrower purposes.

An export is portability evidence, not a database backup: it is not intended for one-click restoration and does not contain the binary Storage objects.

## Restore rehearsal

1. Select a known-good database backup and verify its checksum and access controls.
2. Install PostgreSQL client tools and confirm `pg_restore --version` works.
3. Create a disposable local database whose name begins with `bookzenvo_restore_`.
4. Set `RESTORE_DATABASE_URL` in the shell only. Do not add it to `.env`.
5. Preview: `npm run recovery:restore-local -- C:\path\backup.dump`
6. Read the printed target. Execute only with the exact confirmation shown, for example: `npm run recovery:restore-local -- C:\path\backup.dump --execute --confirm=bookzenvo_restore_test`.
7. Apply no production webhooks, email keys, Stripe keys, cron secrets or service-role keys to the rehearsal environment. Keep outbound email disabled.
8. Run migrations/checks, count core tables, sample bookings/customers, verify foreign keys, and test private/public Storage access using copied test objects.
9. Record restore duration, selected recovery point, checks, failures and remediation. Destroy the disposable environment according to the test-data policy.

The no-cost archive is not marked launch-ready merely because its scheduled task
exists. The first database dump and Storage copy must succeed, and an encrypted
generation must be decrypted and restored into a disposable local Supabase-compatible
environment. Until that dated rehearsal passes, `restoreRehearsal` remains `pending`
in the local metadata and the launch blocker remains open.

## Incident restore decision

Pause writes if continuing would worsen loss. Assign an incident lead, capture timestamps and scope, and preserve logs. Prefer row-level correction or Point-in-Time Recovery into a separate project for comparison over overwriting production. A production cutover requires two-person review, a rollback point, verified object-storage state, secret isolation, DNS/application coordination, and post-cutover integrity checks. The local helper is intentionally incapable of performing that cutover.
