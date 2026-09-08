# Pasha Hair pilot runbook

This is the operating plan for a genuine 1–2 week pilot of Bookzenvo. It is
deliberately small: prove that the salon can run a normal day and that customers
can book reliably before enabling every optional feature.

## Safety rules

- Do not import, copy into tickets, or test with customer data unless Pasha Hair
  has approved that exact use. Never put names, email addresses, phone numbers,
  health details, consultation answers, payment details, or screenshots showing
  them in this repository.
- Keep `email_suppressed` enabled while rehearsing with imported or historic
  data. Use only clearly fictional `@example.com` QA records for rehearsals.
- Do not run browser tests with production owner credentials. The automated
  suite is observational and does not submit bookings, messages, payments,
  signatures, settings, or deletions.
- Make real customer bookings only through the ordinary product UI during the
  live pilot and only with the customer's knowledge.

## Before day one (owner and pilot lead, 45–60 minutes)

1. Confirm the Pasha Hair owner account, business name, address, phone, timezone
   (`Europe/London`), GBP currency, opening hours, cancellation wording and
   refund/deposit policy.
2. Review `/services`: active services, duration, price, processing gaps,
   deposit rules and which staff can perform each service.
3. Review `/staff`: working hours, time off, booking visibility and one clearly
   identified owner/admin. Archive leavers; do not delete history.
4. Open `/preview` in desktop and mobile modes, then open `/book/pasha-hair` on
   an actual phone. Check the Pasha Hair gallery, address, service wording,
   prices, staff, availability, policies and contact route.
5. With fictional `@example.com` details in the safe pilot environment, rehearse
   one owner-created appointment and one public journey up to (but not through)
   payment. Confirm the appointment appears once, at the correct local time and
   under the correct staff member.
6. Decide whether outbound email and payments are in scope. Keep them suppressed
   until their provider configuration, recipient, copy and refund path have been
   checked deliberately. Never "test" by messaging an imported customer.
7. Run the pilot browser checks documented in `tests/e2e/README.md` against the
   safe pilot environment. Record the commit, environment and result below.

## Daily salon flow (5 minutes opening, 5 minutes closing)

Opening:

1. Open Dashboard and compare today's count with Calendar.
2. Check the first appointment, staff/time-off changes, consultations needing
   attention, deposits/balances and low-stock warnings.
3. Add walk-ins or phone bookings through **New booking**, reading the details
   back to the customer before saving. Avoid duplicate customer records by
   searching first.

During the day:

1. Use Calendar as the source of truth. Check in arrivals and update only the
   real appointment status.
2. Use Consultations for required salon records; obtain signatures in person and
   do not place health information in feedback or support messages.
3. If blocked, preserve the appointment on the salon's agreed fallback diary and
   use **Contact support → Urgent — I'm blocked**. For non-blocking friction use
   **Share feedback → Something isn't right**.

Closing:

1. Reconcile completed, cancelled and no-show appointments; leave an issue note
   if the app and salon record differ.
2. Check payments/refunds only if payments are explicitly in pilot scope.
3. Add the day's totals and outcome to the log below. Use counts, never customer
   identities.

## Customer journeys to observe

- Finds Pasha Hair page on a phone; sees correct identity, location and policies.
- Searches/browses services; understands price and duration.
- Selects a suitable staff member and an actually available local-time slot.
- Enters valid contact details, understands payment/deposit and cancellation
  terms, and receives a single clear outcome.
- Can find or use the appropriate cancellation/reschedule route when enabled.
- Salon sees the booking once, for the correct person, staff member, service,
  price and time. No outbound message is assumed successful without provider
  evidence and salon confirmation.

## Issue and outcome log

Use the in-product feedback/support controls for triage. Use this table for the
pilot's daily decision record. Keep it free of personal data.

| Date       | Build/environment           | Journey                 | Expected           | Actual | Severity | Workaround | Owner    | Status               |
| ---------- | --------------------------- | ----------------------- | ------------------ | ------ | -------- | ---------- | -------- | -------------------- |
| YYYY-MM-DD | commit + staging/production | e.g. owner adds walk-in | one calendar entry | —      | S0–S3    | —          | initials | open/verified/closed |

Severity: S0 safety/privacy/payment risk (stop pilot); S1 salon blocked; S2 usable
with workaround; S3 cosmetic or idea. For every S0/S1, note the time, route,
device/browser, build and non-identifying steps to reproduce. Do not attach a
customer screenshot unless it has been fully redacted.

## Success and stop criteria

Review after 5 working days and again at the end:

- At least 95% of attempted in-scope appointments are recorded correctly without
  developer intervention.
- No duplicate booking, wrong staff/time, privacy, payment, or unintended-message
  incident remains unexplained.
- The owner can perform the opening, booking, reschedule/cancel, check-in and
  closing flow without coaching by the end of week one.
- Customer booking completion, abandonment reason, owner-created bookings,
  corrections, support incidents and fallback-diary uses are counted daily.

Stop new live use and return to the agreed salon fallback for any S0, repeated
duplicate/lost appointments, incorrect customer notification, unexplained money
movement, or inability to determine today's diary. Resume only after the cause is
understood, the fix is verified in the safe environment and the owner agrees.

## End-of-pilot decision

Record: continue, extend with named conditions, or stop. Include the counts above,
the three largest sources of friction, unresolved S0–S2 items, owner confidence,
and the exact features approved for the next phase. Do not treat positive verbal
feedback alone as evidence of operational readiness.
