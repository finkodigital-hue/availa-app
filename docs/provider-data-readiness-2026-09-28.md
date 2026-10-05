# Provider and data readiness — 28 September 2026

Status: technical and supplier evidence for founder/privacy review. This record does
not approve a provider, choose a UK GDPR lawful basis or replace signed contracts.
Account-specific items remain open until evidence is saved outside this repository.

## Verified production facts

| Area | Verified state | Launch decision |
| --- | --- | --- |
| Supabase location | Production project `repamfxdbsbotkonhxmj` is in `eu-west-1`, West EU (Ireland). | Record this region in customer schedules. Support and subprocessors may still involve other locations under the DPA. |
| Supabase recovery | Organisation is on Free. The production backup screen states that Free does not include project backups. | Controlled testing may continue. Do not accept irreplaceable salon data until managed backups or an encrypted, restore-tested independent backup exists. |
| ScreenshotOne | Code requires `ENABLE_SCREENSHOTONE=true`; the production feature is described as disabled in the privacy notice. | Keep disabled. Provider says it is not yet GDPR compliant; obtain and review a signed DPA before reconsidering. |
| Google/Microsoft calendar | UI is closed and both connect and callback routes require `ENABLE_CALENDAR_PROVIDER_CONNECTIONS=true`. | Keep disabled until production registrations, consent screens, verification and live tests are complete. |
| Stripe checkout metadata | Customer name, phone, notes, consent flags and appointment details stay in a private Bookzenvo hold. Stripe receives the payer email through Checkout and the minimum business/hold identifiers. | Keep test mode until live KYC plus a controlled payment/refund/reconciliation test is approved. |
| Anthropic assistant | Customer names, booking IDs, contact details, consultation answers and private notes are excluded from assistant context. | Confirm the API account is company-owned and the Development Partner Programme is off. Never send health/special-category data. |
| Browser error reports | Query strings, action-link tokens, email addresses, JWTs and labelled secrets are scrubbed. Reports expire after 30 days through a service-role cleanup job. | Active and verified in production on 28 September 2026. |

## Official provider evidence

| Provider | Evidence and material fact | Account evidence still needed |
| --- | --- | --- |
| Supabase | [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum), [regions](https://supabase.com/docs/guides/platform/regions), [backups](https://supabase.com/docs/guides/platform/backups). The DPA includes transfer terms; database backup availability depends on plan and does not cover Storage objects. | Retain operative DPA, current subprocessor list, backup decision and restore evidence. |
| Cloudflare | [Customer DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), [privacy and data protection](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/). | Record plan, logs/traces and any Logpush destination; verify logs exclude tokens and message bodies. |
| Stripe | [DPA](https://stripe.com/gb/legal/dpa), [DPA FAQ](https://stripe.com/legal/dpa/faqs), [Privacy Centre](https://stripe.com/gb/legal/privacy-center), [service providers](https://stripe.com/legal/service-providers). Stripe may act as processor and independent controller, with long financial/compliance retention. | Contracting entity, Connect roles, live activation/KYC and payment/refund evidence. |
| Resend | [GDPR information](https://resend.com/security/gdpr), [DPA](https://resend.com/legal/dpa), [security](https://resend.com/security). Resend states its DPA is automatic; message/log data is stored in the US and standard plans retain it for 30 days. | Download the signed DPA; record plan, sending region and tracking settings. Keep health data out of email. |
| Twilio | [DPA](https://www.twilio.com/en-us/legal/data-protection-addendum), [message storage](https://help.twilio.com/articles/223181008-Twilio-SMS-message-and-traffic-storage), [redaction](https://www.twilio.com/docs/messaging/guides/privacy-message-redaction), [regional processing](https://www.twilio.com/docs/global-infrastructure/understanding-edge-locations). Defaults can retain records far longer than Bookzenvo needs. On 5 October the account was still a trial with four days remaining, no Twilio phone number and no alphanumeric sender ID; production bindings existed but no sender was production-proven. | Keep real SMS disabled until the account is upgraded, a suitable UK sender is active, retention/redaction/routing settings are evidenced, and an authorised handset delivery plus callback and cost are recorded. See `docs/twilio-production-readiness-2026-10-05.md`. |
| Anthropic API | [Commercial DPA](https://www.anthropic.com/legal/data-processing-addendum), [retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), [server locations](https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers). Commercial inputs are not used for training by default, but ordinary retention and policy exceptions apply; the DPA schedule lists no special-category data. | Company account owner, DPP setting, API retention and current data-flow sign-off. |
| ScreenshotOne | [Privacy policy](https://screenshotone.com/privacy-policy/) and [DPA request](https://screenshotone.com/dpa/). Its current privacy policy says it is not yet GDPR compliant. | Signed DPA and satisfactory provider/legal resolution before enabling. |
| Google Calendar | [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [API User Data Policy](https://developers.google.com/terms/api-services-user-data-policy). | Verified production OAuth application, domain/notice evidence and delegated consent test. |
| Microsoft Graph | [Permissions overview](https://learn.microsoft.com/en-us/graph/permissions-overview), [permission practices](https://learn.microsoft.com/en-us/graph/best-practices-graph-permission), [publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview). | Tenant model, publisher verification, consent test, token deletion/revocation and exact legal role. |

## Order of remaining provider work

1. Put a tested production database and Storage backup in place before real salon data.
2. Retain the operative Supabase, Cloudflare, Stripe, Resend and Anthropic DPAs and subprocessor lists in the private launch file.
3. Confirm the Anthropic company account and training/retention settings.
4. Complete Stripe live activation only at the final money-taking stage, then run a low-value charge, refund and ledger reconciliation.
5. Keep SMS, ScreenshotOne and provider calendar connections off until their individual approval gates are complete.

Never store credentials, signed agreements containing personal details or provider
account screenshots in the public repository. The private evidence file should record
the reviewer, date, document version, account owner and next review date.
