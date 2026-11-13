# Backup freshness reporting

This is a separate read-only reporter, not a backup creator or a restore test. It has not been registered as a scheduled task by these instructions. It does not change the existing `Bookzenvo encrypted production backup` task, which currently runs the backup script from `C:\bookzenvo\launch-fixes`.

## What it verifies and sends

`scripts/report-local-backup-freshness.ps1` runs on Windows PowerShell 5.1 with Node available. Its Node helper searches timestamp-named generations under the private `backups` directory, selects the latest generation with completion metadata, validates the project, completion timestamp, both Storage bucket names and fixed archive filenames, and checks the sizes and SHA256 hashes of **both encrypted archives**. An incomplete generation without metadata may be skipped; invalid metadata or a missing/corrupt archive in a completed generation fails the run rather than silently selecting an older copy.

Only `{completedAt,generation}` is posted to the fixed endpoint `https://bookzenvo-monitor.finkodigital.workers.dev/backup`. Neither database/Storage contents, archive hashes, local paths nor recovery metadata are uploaded. No archive is decrypted. Completion time comes from the verified generation; the reporter never substitutes its execution time. Repeating an old generation therefore cannot make an old backup fresh. A successful response means the evidence was recorded, not that it is within the recovery objective.

The credential is read from `C:\bookzenvo\private-launch-records\backup-config\monitoring-cron-secret.dpapi` by default and decrypted only for the current Windows user. It is sent to Node over stdin and to the fixed HTTPS endpoint as a bearer header. It is not placed in process arguments, URLs, source control or output. `-PrivateRoot` and `-SecretPath` allow operator-controlled local path overrides; there is no target URL override. Redirects are rejected. The request and response have a ten-second deadline and the JSON response is capped at 2 KiB. Failures exit nonzero with fixed messages.

## Verification and activation

1. Deploy and verify the monitor's authenticated `POST /backup` receiver and public `/backup-health` first. The dedicated monitor credential must already be securely configured in that Worker and protected locally for the intended Windows user. Do not recreate or expose the credential in commands.
2. Run the inert regression checks from the repository root:

   ```text
   node scripts/test-backup-freshness.mjs
   ```

3. Verify actual local encrypted archives without reading any credential or contacting the monitor:

   ```powershell
   & .\scripts\report-local-backup-freshness.ps1 -VerifyOnly
   ```

4. When authorised, run the wrapper without `-VerifyOnly` to submit the two-field evidence. Inspect the public `/backup-health` result independently. A failure must not be treated as a successful report.
5. Configure a **separate** Windows task named `Bookzenvo backup freshness report`, hourly, using the signed-in Windows user that owns the protected credential. Use `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\bookzenvo\full-launch-audit\scripts\report-local-backup-freshness.ps1"`, a known Node PATH, start-when-available, wake-to-run and ignore-new-instance settings. A bounded task execution limit is appropriate. Confirm that this checkout/script path remains available; do not point this task at the old backup runner. Registration is an operator step and has not been performed by this document.
6. Configure an external five-minute HTTP check for the verified monitor's `/backup-health`, requiring its expected healthy JSON and HTTP200, with outage and recovery notifications. The receiver uses a **25-hour maximum age: the 24-hour recovery objective plus one hour of reporting grace**. This is an alert threshold, not proof that the 24-hour objective was met. External polling and confirmation add delay. Observe actual scheduled reporter execution and actual notifications before closing the monitoring gap.

## Limits and failure handling

The reporter cannot run while the machine is switched off, signed out or unavailable. The external monitor detects missing fresh evidence even in those cases; the local Windows task alone cannot notify someone while offline. Do not ping the endpoint periodically with the current time to hide an unavailable backup device. Repeating a verified but stale generation is safe: it retains its old completion time and the monitor remains stale.

Checksum verification establishes consistency with local completion metadata, not a new authenticated decryption/restore, protection against a compromised local administrator, or a separately stored copy. USB-copy freshness remains a separate operational check. Independent passphrase recovery and hosted Auth/Storage recovery remain separate acceptance tasks. Do not copy the DPAPI credential or plaintext rehearsal files to a USB as part of this reporter.

On verification failure, inspect the existing backup task and the failed generation locally without printing customer data or credentials. On report failure, check monitor availability and credential configuration; do not change the backup timestamp, retry customer messages or mutate production data. Preserve the existing backup schedule and generations.
