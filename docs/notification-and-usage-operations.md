# Notification, usage and payment recovery operations

Implemented 23 September 2026. This is an operator runbook, not proof of a completed delivery or disaster-recovery drill.

## Notification recovery

Each business/event has a durable delivery record and an exclusive two-minute send lease. A booking's sent marker is written only after provider acceptance or deliberate suppression. Email retries reuse the original request and idempotency key for at most 23 hours; there are at most five attempts with backoff. A timed-out or interrupted SMS request is ambiguous and requires provider review rather than an automatic duplicate send. Explicit SMS rate-limit responses may retry.

Signed provider callbacks update status without downgrading an already delivered message. Twilio callbacks also validate the account and correlate the original delivery ID. Provider acceptance is not proof of delivery to the recipient.

The private `notification_request_snapshots` table holds the original message, including action links, only while recovery is pending. Anonymous and authenticated application roles have no access. Snapshots are deleted after provider acceptance/callback or by the scheduled cleanup after 24 hours. The existing 15-minute reminder job runs cleanup; an outage can delay physical deletion. Delivery metadata stays in the owner's notification activity view.

When a delivery says **Needs review**:

1. An authorised operator checks the provider's delivery log using the recorded provider ID, or the time and intended recipient held in the private operational record if no provider ID was saved. Do not paste message bodies, tokens or recipient details into tickets or logs.
2. If provider acceptance/delivery is confirmed, reconcile that same delivery record. Do not create a new send merely to clear an alert.
3. If the provider confirms no send occurred, decide whether the message is still relevant. Only an explicitly approved replacement should use a new event key; never reset a lease or retry an ambiguous SMS blindly.
4. Record the outcome and operator decision before clearing `manual_review`. Keep unsuccessful/unknown delivery visible; never label it delivered without evidence.

Legacy unfinished submissions have no immutable snapshot and are deliberately placed in review. Earlier booking sent markers with no delivery evidence are not retroactively certified by this change. Booking eligibility windows still apply; an expired reminder is not sent late simply to drain a retry record.

## Protective usage ceilings

The shared server-side counters are per business and category, with UTC calendar periods:

| Category | Per minute | Per day | Per month |
|---|---:|---:|---:|
| AI (chat, page suggestions, stock scan combined) | 10 | 100 | 1,000 |
| SMS provider attempts | 30 | 250 | 2,000 |

All three buckets are checked and incremented atomically. A failed check blocks the request. Only the service role can change overrides in `business_usage_limits`; users cannot reset counters. Counters older than 40 days are pruned by the reminder job. SMS retries consume attempts conservatively, including attempts that later fail. AI responses are also bounded, including chat's 2,048 output-token ceiling.

These are temporary safety ceilings, not published plan entitlements or a guaranteed monetary budget. SMS segmentation/country pricing and model/input sizes affect cost. Founder-approved pricing allowances, provider spend alerts and source/IP controls remain separate launch work. A cap can defer a time-sensitive SMS; delivery review and support must handle this explicitly.

## Unfulfilled booking payments

Recovery checks at most three due issues per sweep, oldest last-checked first. Claims reserve the next 15 minutes, so persistent failures cannot monopolise every sweep. Once a refund ID is recorded, later checks retrieve it rather than create another refund. Failed/cancelled refunds remain unresolved and require review; only provider-confirmed success is marked refunded.

An authorised operator must reconcile the payment, booking, existing refund and connected account in Stripe before taking action. Do not create a second refund merely because an earlier response timed out. Sandbox end-to-end failure/recovery tests remain required before live payments.

## Monitoring and release evidence

The authenticated `/api/monitoring/client-errors` endpoint reports HTTP 503 for delivery review records, unfulfilled payments older than 30 minutes, database lookup failures or excessive recent browser errors. It exposes counts, not customer content. The existing **Production error alerts** GitHub workflow polls it. GitHub schedules can be delayed; this is not a guaranteed 15-minute incident response service. An alert reaching primary/deputy responders still needs a controlled drill.

Validation: 150 isolated regression assertions, TypeScript, production compilation and the security-boundary check (RLS on 58 public tables). SQL migrations `20260923001000`–`20260923003000` applied successfully to production in one transaction. Live read-only checks confirmed all three migration records, RLS on all three new private tables, no anonymous claim execution and no authenticated snapshot SELECT. At the migration check there was one legacy delivery requiring review and zero unresolved booking-payment issues. No customer email/SMS or live card transaction was sent as a test.
