# Independent production monitor

Separate Worker `bookzenvo-monitor`, scheduled every five minutes, with one SQLite-backed Durable Object. It does not send messages, modify customer records, invoke reminder jobs or use Supabase credentials. An external monitoring service must deliver incident/recovery alerts: this Worker alone is not a complete alerting service.

## Checks and stored evidence

Each run checks fixed `https://bookzenvo.com` HTML, its same-origin fingerprinted entry bundle, public `/api/health` and private `/api/monitoring/client-errors`. Requests reject redirects, use ten-second deadlines (including body reads), bounded HTML/JSON bodies and at most two attempts. The private probe alone carries `MONITORING_CRON_SECRET`. A healthy response requires valid, fresh timestamps and expected health/count fields, not merely an HTTP 200.

Redirects use Cloudflare-supported `redirect: "manual"`; any 3xx response is cancelled and rejected without fetching its Location. Do not change this to `follow` (which can forward credentials) or `error` (unsupported by the Workers runtime).

Results contain only check names, booleans, fixed reason codes and run timestamps. No response bodies, tokens, customer data or private incident counts are stored. History retains the last 288 completed runs (approximately 24 hours with uninterrupted five-minute execution, not a time-based retention guarantee).

One storage-serialised lease prevents overlapping cron/manual probes. The lease lasts 90 seconds; stale workers cannot overwrite a newer run or publish success after their own lease expires. Duplicate completed slots are skipped. A failed probe is a completed **unhealthy** run; the next successful run can recover it.

## Endpoints

Public `/health`, `/drill` and `/backup-health` also support `HEAD`: the same status and cache headers as `GET`, with an empty body and no state changes. This supports HTTP monitors whose default request method is HEAD. Keyword/body checks must use GET. Other unsupported methods remain rejected.

- `GET /health`: public, no-store, only overall status and recent completion timestamp. Returns 200 only when the latest completed run is healthy and no older than 12 minutes, and an actual scheduled run also completed within 12 minutes. Manual runs cannot conceal a stopped schedule. Never-run, stale, invalid or unreadable state returns 503. Reads do not run probes or refresh the heartbeat.
- `GET /status`: operator-only bearer authentication; returns bounded internal run history and any current lease.
- `POST /run`: operator-only bearer authentication; runs the current five-minute slot unless already running/completed. Its 200 means the run was recorded, **not** that the website passed; check `/health` or `/status`. Duplicate/in-progress returns 202, superseded/expired completion 409.
- `GET /drill`: public, no-store, explicitly labelled **test only**. Defaults to HTTP 200 `test_up`. During an operator-created alert drill it returns HTTP 503 `test_down`. This is a notification-delivery fixture, never a production health signal; its response deliberately has no heartbeat timestamp.
- `POST /drill`: operator-only bearer authentication with `Content-Type: application/json` and exactly `{"status":"down"}` or `{"status":"up"}`. The body is capped at 256 bytes and a two-second read deadline. A separate Durable Object record stores the last change ID, time and expiry without changing actual probe results, leases, history or scheduled heartbeat. It returns HTTP 200 on a successful state change even when the resulting public drill status is down.
- `GET /backup-health`: public, no-store, only `status` and `lastBackupAt`. Returns 200 only for a valid recorded backup completion no older than 25 hours; missing, invalid, future beyond 30 seconds, unreadable or stale evidence returns 503. Reading it never renews evidence.
- `POST /backup`: authenticated with the dedicated monitor bearer, accepts exactly `{"completedAt":"2026-11-13T12:01:00.0000000Z","generation":"2026-11-13T120000Z"}` as JSON, capped at 256 bytes with a two-second body deadline. Success is HTTP 200 `{"status":"recorded","duplicate":false}` or `duplicate:true` for an identical replay. Invalid payload/time returns 400; old or conflicting evidence returns 409. Unsupported content type returns 415; oversized body returns 413; stalled body returns 408.
- Other paths, methods and any query strings are rejected. No URL parameter can change targets or trigger public work.

Operator endpoints use the same dedicated `MONITORING_CRON_SECRET` as the narrowly scoped application probe. Keep it out of public URLs, source control, command history and logs. Use a randomly generated secret containing at least 32 random bytes, encoded as text. Do not reuse the existing `MONITORING_SECRET`, database keys or any user session. The parent application must accept the new secret **only** on its aggregate monitoring endpoint before activation.

## Local verification

From the repository root:

```text
node scripts/test-independent-monitor.mjs
npx wrangler deploy --dry-run --config monitoring/wrangler.jsonc
```

Tests use fake fetch and storage; no production network requests or notifications occur. They exercise healthy/failing probes, redirect and credential boundaries, malformed/stale data, size/deadline limits, concurrency, stale completion rejection, failure/recovery, bounded history and public endpoint privacy. A deployment dry-run bundles locally; it is not hosted evidence.

## Activation checklist — account operator only

1. Verify the Cloudflare account and that `bookzenvo-monitor` does not conflict with an existing Worker. Review plan allowances and SQLite Durable Object availability. This directory does not authorise purchases.
2. Deploy the parent application's narrowly scoped new-token support. Configure the dedicated secret securely in the application and monitor; retain the existing GitHub monitoring secret unchanged.
3. Deploy using this directory's Wrangler configuration, not the main website configuration. Confirm the actual assigned `workers.dev` hostname; do not guess it. Verify initial `/health` returns 503 before a successful run.
4. Execute an authorised manual run and inspect private `/status`. Public `/health` stays unhealthy until a real scheduled run has also completed; a manual run may claim the current slot, so wait for the following five-minute tick. Confirm real scheduled completions over several cycles; Cron configuration alone is not evidence that jobs ran.
5. Configure UptimeRobot or another independently operated checker for the actual monitor `/health` **and** `https://bookzenvo.com/api/health`. Require the expected `ok` response as well as HTTP success, reject redirects where supported, and enable confirmed outage and recovery notifications to the approved contacts. No secret is needed for these public checks.
6. Confirm the fallback checks and notifications continue when Bookzenvo, Supabase or this monitor cannot respond. Perform controlled tests in an isolated test monitor rather than deliberately interrupting the production website. Prove alert delivery to a human; creating a contact is not delivery evidence.
7. Retain GitHub post-deployment revision validation and monitoring as additional signals. Record actual activation, recipient verification and drill results in the private operations record.

## Limits

This checks HTTP availability and operational aggregates; it does not execute the client JavaScript, verify every booking/payment workflow or prove end-to-end notification delivery. A separate Cloudflare Worker shares Cloudflare's failure domain. External active polling and independently delivered alerts are essential for a Cloudflare outage. Five minutes is the intended schedule, not an uptime or detection-time SLA. An external provider's polling interval and incident-confirmation setting add to detection time; a stopped scheduler is detected after the 12-minute freshness allowance plus that delay.

No direct alerts/outbox are implemented here: external monitoring owns alert deduplication and recovery messages. An unhealthy monitor result does not authorise automated refunds, retries of customer messages or destructive remediation.

## Isolated notification drill

Create a **separate** external monitor labelled `BOOKZENVO TEST ONLY` pointing at the verified Worker hostname's `/drill`, with the approved test recipient. Never replace either real health monitor with this fixture. Verify its normal response first, then make an authorised `POST /drill` with `{"status":"down"}`. Observe an actual external outage notification, explicitly restore `{"status":"up"}`, and observe its recovery notification. Record both deliveries and then pause the external test monitor. This endpoint does not send emails itself.

A down state expires automatically after 30 minutes, measured from its recorded change time. Reads and repeated identical writes do not renew that expiry or change metadata. If a down drill has expired and another is needed, explicitly set `up` before setting `down` again. Automatic expiry is a safety measure; it is not evidence that a deliberate recovery step or notification was received. The fixture's healthy response does **not** prove Cron, website, database or real-monitor health. Those remain independently checked by `/health` and the actual website checks.

## Missed-backup alert

Configure a separate external monitor against `/backup-health`. Its 25-hour freshness limit represents a 24-hour backup objective plus one hour of reporting grace; it does not prove the objective was achieved or guarantee a recovery point. The local reporter must verify the completed generation's encrypted database and Storage archives before uploading the **original** metadata completion time and generation directory name. Never upload filenames containing arbitrary paths, archive contents, encryption keys, recovery passphrases, hashes or customer data. Store the bearer securely on the reporting computer; the Worker needs no database or encryption credentials.

`generation` uses the existing backup directory format `yyyy-MM-ddTHHmmssZ`. `completedAt` must be UTC ISO with seconds and optionally one to seven fractional digits, accommodating PowerShell round-trip timestamps. Both must represent real calendar dates. Completion must fall between 30 seconds before generation start (clock allowance) and six hours after it (bounded backup-duration allowance), and neither can be more than 30 seconds in the future. Completions are compared/stored at millisecond resolution. Aged genuine reports are accepted, but immediately remain unhealthy when older than 25 hours. Backups exceeding the duration allowance require investigation; do not change their dates to bypass validation.

The separate `backup` record never changes real probe history, scheduled heartbeat, active lease or drill state. A new report must advance both generation and completion. An identical generation/completion replay returns success without rewriting any timestamps; changing the completion for the same generation or submitting older evidence returns 409. The actual completion timestamp, not report arrival time, controls freshness. These controls prevent accidental replay from hiding missed work, but a holder of the reporting secret could fabricate evidence: this is an authenticated operational receipt, not remote cryptographic proof that backup or restoration succeeded. Off-computer copies and restore rehearsals remain separate controls.

Implementation references: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [SQLite Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Worker redirect/header behaviour](https://developers.cloudflare.com/workers/runtime-apis/request/), [why ordinary KV is not a lease store](https://developers.cloudflare.com/kv/concepts/how-kv-works/).
