# Twilio production-readiness evidence — 5 October 2026

Status: SMS remains disabled. This record contains no credentials, phone numbers or
message content.

## Verified account state

- The Twilio account is still a trial account and the console showed four trial
  days remaining.
- The account has no Twilio phone number and no alphanumeric sender ID.
- The production Cloudflare Worker has server-only bindings named
  `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`,
  `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`. Secret values were not displayed or
  copied. Because the Twilio account has no sender, the configured From value is
  not production-proven.
- Pasha Hair's **SMS appointment reminders** preference was visibly off in the
  production Bookzenvo workspace.
- The Bookzenvo provider tests passed: 26 notification lease, retry, callback and
  privacy assertions; six international phone-format checks; and the complete
  security-boundary check covering 72 public tables.
- A deliberately unsigned callback to the production Twilio webhook returned HTTP
  401. No provider SMS was sent during this review.

## Activation gate

Do not turn on a business's SMS reminder preference until all of these are recorded:

1. Upgrade the Twilio account with company billing and tax details.
2. Obtain an appropriate UK-capable sender and complete any required sender or
   brand registration. Decide whether a reply-capable number or one-way branded
   sender fits the support and opt-out process.
3. Replace or verify the production From/Messaging Service binding and keep the API
   credentials server-only.
4. Review Twilio message retention, redaction, regional routing, DPA and
   subprocessors, and retain the account-specific evidence privately.
5. Set a small approved balance, low-balance alert and usage ceiling before the
   first production message.
6. Send one appointment reminder to an authorised Bookzenvo handset, confirm the
   delivery callback in Bookzenvo, measure the charged cost, and test the documented
   support/opt-out route without using a real customer's booking.

Until this gate is complete, public wording must continue to say SMS requires
activation and may have usage charges.
