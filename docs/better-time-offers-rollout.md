# Better-time opening offers — rollout gate

Status: **implemented on `codex/better-time-offers-20261004`, not enabled**.
`BETTER_TIME_OFFERS_ENABLED` defaults to off. When off, clients see the existing
manual booking-request wording, submissions stay manual, and the reminder cron
does not send opening offers. Do not switch it on merely because a deployment
or migration succeeds.

## Implemented scope

- A client with no suitable time can explicitly request an email about a
  matching **cancellation**. Old manual requests are not enrolled.
- A cancellation queues a private event. The cron offers that slot to one
  matching request at a time, oldest request first.
- The database creates a 15-minute hold that the normal booking picker,
  booking conflict guard, and Stripe checkout all observe.
- A bearer link lets the recipient book or stop alerts. The link is single-use
  for booking. An expired offer can move to the next matching client.
- No SMS and no automatic messages from development or preview environments.

This does **not** yet enroll someone who already has a later confirmed booking
in an earlier-time request. That journey must reschedule the existing booking
and correctly handle any deposit or full payment; creating a second booking
would be unsafe. Newly added working hours are not yet an opening event.

## Before enabling

1. Apply both `2026100401*` migrations to a non-production database first.
2. Run the full schema replay and booking-request tests; exercise free and
   deposit/full payment offers with a fictional salon and Stripe test mode.
3. Verify two simultaneous accept attempts cannot produce two bookings, and
   check expired, cancelled-checkout, opt-out, suppressed-email and refund
   recovery paths.
4. Use a redirected test email recipient and verify the link on mobile. Confirm
   the local date/time and the price shown match the final booking/checkout.
5. Review the exact consent and alert wording with UK privacy counsel.
6. Only then set `BETTER_TIME_OFFERS_ENABLED=true` in the production worker;
   monitor the existing reminder-cron heartbeat and `betterTimeOffers` counts.

To stop new automated offers immediately, remove or set the flag to `false`.
Existing holds expire on their own; do not delete live checkout rows.
