# Support, on-call and pilot operations

Status: ready-to-complete operating template. It does not prove that the inbox, alerts or named people are staffed. Complete the private contact sheet and run the drills before launch.

## Coverage record

| Responsibility | Primary | Deputy | Channel | Coverage/response target | Escalation |
| --- | --- | --- | --- | --- | --- |
| Customer/salon support | `[name]` | `[name]` | `help@bookzenvo.com — verify reception and reply identity` | `[complete]` | `[complete]` |
| Production incident lead | `[name]` | `[name]` | `[private]` | `[complete]` | `[complete]` |
| Privacy incident/rights | `[name]` | `[adviser/deputy]` | `[private]` | `[complete]` | `[complete]` |
| Payment reconciliation | `[name]` | `[name]` | `[private]` | `[complete]` | Stripe support/accountant |
| Pilot salon | `[salon contact]` | `[salon fallback]` | `[private]` | Pilot hours | `[complete]` |
| Deployment/rollback | `[name]` | `[name]` | `[private]` | `[complete]` | Cloudflare/GitHub support |

Keep personal phone numbers and account recovery details in the private contact sheet, not this repository.

## Severity and first response

| Level | Examples | Immediate action |
| --- | --- | --- |
| S0 | Privacy/security exposure, unexplained money movement, wrong customer message, lost/duplicate appointments at scale | Stop the affected flow, use fallback diary, preserve evidence, notify incident lead and assess controllers/people. |
| S1 | Salon cannot see/use today's diary, payment or notification queue stuck, widespread booking failure | Switch salon to fallback, halt risky retries/releases, investigate providers and communicate status. |
| S2 | Important journey degraded with a safe workaround | Record workaround, owner and repair target; monitor for spread. |
| S3 | Cosmetic friction or idea | Backlog with evidence; do not interrupt safe operations. |

## Support handling

1. Record a private ticket reference, received time, business, affected journey and severity. Avoid copying client or health information into engineering tools.
2. Acknowledge with the known facts and safe workaround. Never promise a resolution time without an owner.
3. For payments, messages, deletions and bookings, reconcile the provider and Bookzenvo records before retrying, refunding, resending or editing.
4. Escalate suspected privacy/security matters under the breach runbook; do not investigate through a customer's account without recorded authority.
5. Close only after the requester or operator confirms the outcome and the system/provider evidence agrees. Add a non-identifying cause and prevention action.

## Launch and conference operating checklist

### Before opening

- Confirm exact production release and healthy status, booking page, sign-in, legal pages and support inbox.
- Confirm primary and deputy can receive GitHub/Cloudflare/provider alerts and reach the private contact sheet.
- Keep a paper/offline fallback diary and the salon's customer-contact policy available.
- Confirm which features are enabled; disable or avoid demonstrating anything outside the approved claims register.
- Use a dedicated fictional demo workspace. Do not expose imported contacts, health records, real payment details or action links on a public screen.

### During a demo or pilot day

- Record counts and incident references, never customer details, in the shared operational log.
- Announce any limitation factually; do not improvise legal, security, grant or provider claims.
- Stop a live payment/message/booking demonstration if the intended recipient, account or amount is uncertain.
- For S0/S1, switch to fallback, freeze related automation where safe and contact the incident lead.

### Closing

- Reconcile appointments, payments/refunds and delivery/review queues.
- Check support tickets, monitoring and provider alerts.
- Record release, counts, issues, workarounds, owner and next-day decision.

## Drills required

Record date, participants, exact release/configuration, evidence and follow-up for:

1. production rollback and health verification;
2. outage with fallback diary and salon communication;
3. failed/ambiguous SMS or email without duplicate resend;
4. payment callback delay and refund reconciliation;
5. privacy breach tabletop and rights request;
6. primary unavailable, deputy receives and handles an alert; and
7. provider account recovery without sharing secrets.

