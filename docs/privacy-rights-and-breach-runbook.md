# Privacy rights and personal-data breach runbook

Status: operational template for BOOKZENVO LTD. It must be completed with named responders and reviewed by a UK data-protection adviser. Do not put requesters' identity documents, client records, health data, access tokens or incident secrets in repository tickets.

## Rights-request intake

Accept requests through the published support route and any channel where a request is reasonably clear. Log only a private case reference in ordinary engineering tools.

| Field | Private case record |
| --- | --- |
| Case reference and received date/time | `[complete]` |
| Requester and represented person | `[complete securely]` |
| Request type | `access / correction / erasure / restriction / objection / portability / consent withdrawal / complaint / other` |
| Controller identified | `salon / BOOKZENVO LTD / unclear` |
| Identity-verification method and outcome | `[proportionate; complete]` |
| Scope clarification | `[complete]` |
| Normal response deadline and any lawful extension | `[calculate and review]` |
| Systems/providers searched | `[complete]` |
| Exemption/legal-hold decision and reviewer | `[complete if applicable]` |
| Secure response/delivery method | `[complete]` |
| Closure, evidence and deletion of verification material | `[complete]` |

### Request procedure

1. Acknowledge promptly without confirming data to an unverified person.
2. Identify whether the salon or Bookzenvo is controller for the requested records. If Bookzenvo is the processor, preserve the request and alert the controller under the DPA; do not decide exemptions for the salon.
3. Verify identity only to the degree necessary and avoid collecting excessive identity evidence.
4. Preserve relevant records and apply any lawful restriction or hold while the decision is made.
5. Search database, authentication, Storage, support, messaging, billing and relevant provider records. Record sources and search dates.
6. Review third-party information, legal duties, exemptions and secure redaction with the accountable reviewer.
7. Supply the response securely in an intelligible and portable form where required. Explain any refusal or limitation and complaint route.
8. Record completion, provider/deletion lag, follow-up and evidence; remove temporary identity/export material under the retention schedule.

## Suspected breach intake and containment

Anyone who sees a possible disclosure, loss, alteration, unauthorised access, misdirected message, compromised credential or unavailable personal data should contact `[primary incident contact]`; fallback `[deputy and method]`.

1. **Protect people and preserve evidence.** Revoke exposed credentials/tokens, restrict access, pause the narrow affected feature or sender, preserve logs and prevent automatic retries. Avoid broad deletion that destroys evidence.
2. **Open a private incident record.** Record discovery time, reporter, affected system/release, what happened, containment actions and evidence locations.
3. **Determine roles and notify controllers.** Identify Bookzenvo-controller records and every salon-controller dataset. Where Bookzenvo is processor, notify the controller without undue delay under the DPA and provide updates; do not wait for perfect facts.
4. **Assess risk to people.** Record categories and approximate numbers of people/records, sensitivity, identifiability, consequences, duration, recipients, protection such as encryption, recovery and likely misuse.
5. **Make regulatory/individual notification decisions.** The accountable privacy owner and adviser calculate the applicable deadline from awareness, decide whether regulator and affected-person notices are required, and record the reasons. Do not rely on this template as the decision.
6. **Recover and monitor.** Verify containment, correct data/permissions, reconcile provider events, monitor misuse and give practical support to affected people where needed.
7. **Close and learn.** Record root cause, remediation, validation, residual risk, policy/product changes and next review. Retain the incident record under the approved schedule even where no external notification was required.

## Breach assessment record

| Item | Entry |
| --- | --- |
| First occurrence / detection / organisational awareness | `[three separate times]` |
| Systems, providers and release | `[complete]` |
| Confidentiality / integrity / availability impact | `[complete]` |
| People and record categories/counts | `[complete or best estimate]` |
| Special-category, financial, credential or child data | `[complete]` |
| Likely consequences and risk rating | `[complete]` |
| Controller(s), processor(s), insurers/advisers informed | `[complete]` |
| Regulator notification decision, deadline and reference | `[complete]` |
| Individual notification decision and approved wording | `[complete]` |
| Containment/recovery proof | `[complete]` |
| Root cause and corrective actions | `[complete]` |
| Decision owner, adviser and closure date | `[complete]` |

## Rehearsal

Before launch, run a tabletop exercise for a cross-salon exposure or misdirected consultation email. Include the founder, deputy, technical owner and support responder. Measure time to containment, controller identification, evidence preservation and draft notification. Use fictional data and keep the exercise report private.

