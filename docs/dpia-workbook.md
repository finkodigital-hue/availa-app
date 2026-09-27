# DPIA workbook for higher-risk Bookzenvo processing

Status: assessment template. Complete it before enabling health/consultation data, child-facing use, AI processing of workspace data or any other processing likely to create high risk. It is not a pre-filled finding or legal approval.

## 1. Assessment record

| Field | Entry |
| --- | --- |
| Feature/processing | `[complete]` |
| Product release/configuration | `[complete]` |
| Business owner | `[complete]` |
| Privacy/security reviewers | `[complete]` |
| Salon/controller consulted | `[complete]` |
| Individuals or representatives consulted | `[complete or explain why not]` |
| Start/review date | `[complete]` |
| DPIA trigger/screening result | `[complete]` |

## 2. Describe the processing

Document data flow from collection to deletion: people, data fields, special-category data, volumes, frequency, sources, recipients, providers, countries, interfaces, authentication, access roles, exports, backups and retention. Link the actual screen wording and provider settings. State whether the feature is optional and what happens if a person refuses or withdraws.

For consultation/patch-test records, separately document signatures, guardian/capacity policy, salon access, staff notes, withdrawal, versioned consent wording and erasure. For AI, document exact prompt/context construction, images, provider retention/training settings, human review, spend/usage limits and whether client names or health data can enter a prompt.

## 3. Purpose, necessity and proportionality

| Question | Answer/evidence |
| --- | --- |
| Exact purpose and expected benefit | `[complete]` |
| Why each field and recipient is necessary | `[complete]` |
| Less intrusive alternative considered | `[complete]` |
| Controller/processor roles | `[complete]` |
| Article 6 basis | `[decision]` |
| Article 9 condition and supporting basis | `[decision where applicable]` |
| Notice, transparency and user control | `[complete]` |
| Accuracy/correction process | `[complete]` |
| Rights, portability and deletion handling | `[complete]` |
| Retention and deletion proof | `[complete]` |
| Children/guardian/capacity safeguards | `[complete where applicable]` |
| Automated decision/profiling position | `[complete]` |

## 4. Risk assessment

Score likelihood and severity before and after controls using a documented 1–5 scale. Do not lower a score merely because a control exists; record evidence that it works.

| Risk to people | Affected people | Cause/event | Existing controls | Initial L/S | Additional action, owner and due date | Residual L/S | Accepted by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unauthorised salon or cross-tenant access | Clients/staff | Role, query or support error | Tenant controls and access roles | `[ ]` | Independent test/access review | `[ ]` | `[ ]` |
| Sensitive consultation disclosure | Clients, including children | Excess access, export, support or screenshot | Restricted screens and audit controls | `[ ]` | Legal basis, role test, staff procedure | `[ ]` | `[ ]` |
| Wrong person receives a message/action link | Clients | Incorrect contact, reused token or retry | Token and delivery controls | `[ ]` | Controlled journey and incident playbook | `[ ]` | `[ ]` |
| Payment/appointment mismatch | Clients/salons | Callback, retry or provider outage | Idempotency/reconciliation | `[ ]` | Sandbox/live test and ledger review | `[ ]` | `[ ]` |
| AI disclosure or misleading output | Clients/staff/salon | Over-broad context or unreviewed output | Optional feature, editable draft | `[ ]` | Minimise context, block health data, provider review | `[ ]` | `[ ]` |
| Excess retention or failed erasure | All | Backup/provider/object mismatch | Request and erasure tooling | `[ ]` | Retention schedule and deletion rehearsal | `[ ]` | `[ ]` |
| Child cannot understand or validly choose | Children | Adult wording or unclear guardian route | `[verify]` | `[ ]` | Age-appropriate design/legal decision | `[ ]` | `[ ]` |
| Service outage loses diary availability | Clients/salon | Provider/deployment failure | Monitoring and fallback diary | `[ ]` | Restore/rollback drill | `[ ]` | `[ ]` |

Add all material risks found during consultation, pilot, threat modelling and provider review.

## 5. Approval and prior consultation

List every open action and disable the affected feature until its launch condition is met. If high residual risk remains, obtain specialist advice on whether regulator consultation is required before processing. Record the final decision, reasons, approvers, rejected options, exact enabled configuration and next review triggers.

