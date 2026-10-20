# Reminder sweep recovery — 20 October 2026

Production investigation found two independent failures:

1. The active 15-minute Supabase job used pg_net's five-second default HTTP
   timeout. All 24 retained requests timed out; the latest successful heartbeat
   was from 12 October.
2. With an explicit two-minute timeout, the response exposed a completion
   failure. Worker logs confirmed `Too many subrequests by single Worker
   invocation`. The handler loaded each suppressed Studio QA salon, spending
   its request budget on work which could never deliver a message.

The migration updates the existing named job to use a 120-second timeout.
It does not immediately invoke the job or change its cadence or Vault secret.
Reminder candidate selection now excludes businesses with both channels
suppressed. Email-only confirmation, review and retention selection requires
email to be explicitly enabled. Send-time suppression checks remain in place.
Recovery and subscription processing are not gated by notification suppression.

Regression tests execute the stored scheduler command against inert services,
verify repeated migration application and absence of immediate requests, and run
the real route/retention handlers against 100 suppressed fictional businesses
plus email-only and SMS-only businesses under a simulated 50-request ceiling.
The fixture completes with a successful heartbeat in 16 requests and no sends.

Before production verification, the remaining fictional QA Free Salon's email
and SMS flags were changed from enabled to suppressed. All production
workspaces were then confirmed suppressed; Pasha Hair's existing suppression
was preserved. Coordinate any future enablement with the salon's consent and
Finlay's provider setup.

Operational verification must check the actual scheduled HTTP response,
completion heartbeat, provider delivery counts and incident monitor after
deployment. A successful cron SQL enqueue alone does not prove sweep success.

This addresses the observed suppressed-workspace amplification. A sufficiently
large active messaging workload still requires queue-based bounded processing;
do not assume a two-minute timeout makes one invocation scale indefinitely.
