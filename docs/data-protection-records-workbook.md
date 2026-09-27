# Data-protection records workbook

Status: template for BOOKZENVO LTD's UK launch. It does not select lawful bases, special-category conditions, retention periods or regulatory registrations. Those decisions require completion by the accountable owner and adviser.

## ROPA — Bookzenvo as controller

Create one row per distinct purpose rather than per database table.

| Purpose | Data subjects | Personal-data categories | Source | Article 6 basis | Article 9/10 condition | Recipients/subprocessors | Countries/transfers | Retention and trigger | Security/access | Owner/review date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Account creation, authentication and recovery | Business owners and authorised users | Identity, contact, login and security records | Individual/account owner | `[decide]` | `[n/a or decide]` | Supabase, Cloudflare, email provider | `[verify]` | `[decide]` | Role access, MFA decision, logs | `[complete]` |
| Subscription and company billing | Business contacts | Identity, company, plan, transaction and invoice references | Customer, Stripe | `[decide]` | `n/a expected; verify` | Stripe, accountant/provider | `[verify]` | `[tax/contract decision]` | Restricted billing access | `[complete]` |
| Customer support | Users/requesters | Contact, correspondence, diagnostic information | Requester/product | `[decide]` | Avoid special-category data; record exception | Email/support/hosting providers | `[verify]` | `[decide]` | Need-to-know access | `[complete]` |
| Security, abuse prevention and incident response | Users, visitors and attackers/alleged attackers | IP/device, event, account and limited content evidence | Product/providers | `[decide]` | `[assess]` | Cloudflare, Supabase, advisers/authorities if required | `[verify]` | `[decide]` | Restricted logs, monitoring | `[complete]` |
| Waitlist and launch communications | Prospects | Contact, business interest, consent/preferences | Individual | `[decide]` | `n/a expected; verify` | Email provider | `[verify]` | `[decide]` | Suppression/unsubscribe | `[complete]` |
| Website operation | Visitors | Technical request and necessary-storage records | Device/network | `[decide]` | `n/a expected` | Cloudflare | `[verify]` | `[decide]` | Network controls | `[complete]` |

Add separate rows for employee/contractor, grant, event lead, legal-claim and marketing processing when those activities start.

## ROPA — Bookzenvo as processor

Maintain one client schedule or a grouped record only where the processing is truly the same.

| Salon/controller | Service/version | Data subjects | Data categories, including special category | Processing and purpose | Locations/transfers | Subprocessors | Start/end | Deletion/return instruction | Controller contact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `[complete]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` | `[complete]` |

## Lawful-basis and necessity decision

For every controller-purpose row, record:

1. the precise purpose and why the processing is necessary;
2. alternatives using less data;
3. the Article 6 basis and why its elements are met;
4. where relevant, the separate Article 9 condition and supporting law/document;
5. the notice, choice or consent wording the person sees;
6. consequences of refusal or withdrawal;
7. balancing test if legitimate interests is used;
8. automated-decision or profiling assessment;
9. child/guardian and capacity decision; and
10. approver, date, review trigger and evidence reference.

## Retention schedule

| Record group | Controller/processor context | Retention trigger | Active period | Backup/technical expiry | Legal hold/exceptions | Deletion method and proof | Decision owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account/authentication | `[complete]` | Closure/last activity | `[decide]` | `[provider evidence]` | `[decide]` | `[complete]` | `[complete]` |
| Salon client and booking records | Salon controller | Salon instruction/relationship end | `[salon decides]` | `[provider evidence]` | `[salon decides]` | Export/erase process | Salon |
| Consultations/signatures/health records | Salon controller | Service/record event | `[specialist decision]` | `[provider evidence]` | `[complete]` | Tested erasure | Salon + adviser |
| Payment and accounting references | Mixed | Transaction/tax period | `[accountant decides]` | `[provider evidence]` | Disputes/legal duty | Provider/local deletion split | Founder + accountant |
| Support records | Bookzenvo controller | Ticket closure | `[decide]` | `[provider evidence]` | Dispute/security need | `[complete]` | Support owner |
| Security/error logs | Bookzenvo controller | Event date | `[decide]` | `[provider evidence]` | Incident/legal hold | Scheduled deletion | Security owner |
| Message delivery records/content snapshots | Mixed | Delivery/attempt | `[verify actual controls]` | `[provider evidence]` | Delivery dispute | Cleanup + provider policy | Operations |
| Imports and temporary transfer files | Processor | Import validation/completion | `[short period]` | `[provider evidence]` | Approved exception only | Secure deletion confirmation | Migration lead |

## Completion gate

Reconcile the finished records with the live privacy notice, DPA, provider contracts, database/storage deletion behaviour, backup cycles and support procedures. Record any mismatch as a launch exception with an owner and expiry date.

