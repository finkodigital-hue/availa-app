# Subprocessor and international-transfer register

Status: evidence template, not a claim that every listed provider is enabled or contractually approved. Populate it from the production configuration and executed provider terms. Publish only the customer-facing fields after privacy/legal review.

Current technical/provider research is recorded in
[`provider-data-readiness-2026-09-28.md`](./provider-data-readiness-2026-09-28.md).
The production Supabase project region is verified as `eu-west-1` (West EU,
Ireland), but the Free plan has no managed backups. ScreenshotOne and Google/
Microsoft provider connections are technically disabled pending approval.

## Production register

| Provider/legal entity | Service and data purpose | Data subjects/categories | Role | Processing/storage locations | UK transfer mechanism and assessment | DPA/terms version and evidence | Retention/deletion setting | Security/contact evidence | Enabled features | Change/objection notice | Owner/review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | Database, authentication and object storage | `[complete]` | `[verify]` | `[verify project and support locations]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | Core platform | `[complete]` | `[complete]` |
| Cloudflare | Hosting, network/security and deployment | `[complete]` | `[verify]` | `[verify]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | Core platform | `[complete]` | `[complete]` |
| Stripe | Subscription and enabled appointment payments | `[complete]` | `[role varies; verify]` | `[verify]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | Payments | `[complete]` | `[complete]` |
| Resend and its delivery infrastructure | Transactional/operational email | `[complete]` | `[verify chain]` | `[verify]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | Email | `[complete]` | `[complete]` |
| Twilio | Appointment SMS, only if enabled | `[complete]` | `[verify]` | `[verify]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | SMS | `[complete]` | `[complete]` |
| Anthropic | Optional AI processing, only if enabled | `[complete exact context]` | `[verify]` | `[verify]` | `[complete]` | `[complete]` | `[verify configured and contractual retention]` | `[complete]` | AI | `[complete]` | `[complete]` |
| ScreenshotOne | Optional booking-page screenshot for AI editor | `[complete]` | `[verify]` | `[verify]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | AI page editing | `[complete]` | `[complete]` |
| Google / Microsoft | Optional connected calendar sync | Appointment/staff details `[verify]` | `[verify]` | `[verify]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | Calendar sync | `[complete]` | `[complete]` |

Remove a provider from the public list when the feature is disabled and no production processing remains; do not remove it from historical contract/incident records. Add support, monitoring, accounting, CRM or other providers if they receive personal data outside the code path.

## Provider approval checklist

- Legal entity, service, account owner and support/security contact identified.
- Data flow and minimum fields confirmed against actual production requests.
- Provider role and onward subprocessors assessed.
- DPA/terms executed or accepted and version retained.
- Countries, remote support access, transfer mechanism and transfer-risk assessment recorded.
- Retention, training/use, deletion, backup and law-enforcement request positions recorded.
- Least-privilege access, MFA, key rotation, spending/usage limits and incident alerts configured.
- Exit/export/deletion process and replacement dependency documented.
- Privacy notice, DPA schedule and customer change notice reconciled.
- Owner and next review date assigned.

## Change process

Before adding or materially changing a provider, the technical owner submits the data flow and intended date to the privacy owner. The privacy owner assesses contract, transfers, notice/objection requirements and DPIA impact. The provider remains disabled until approval and production controls are evidenced. Keep the old and new register versions and the notices sent.
