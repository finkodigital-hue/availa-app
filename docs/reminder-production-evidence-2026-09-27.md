# Production reminder evidence — 27 September 2026

This records a read-only production check of the appointment-reminder pipeline. No reminder was manually triggered, no recipient data was exported, and no delivery record was changed.

## Scheduler and authentication

- Supabase `pg_cron` job `send-booking-reminders` is active on its 15-minute schedule.
- Supabase Vault contains the server-only `cron_reminder_secret` used by the job.
- The `send-reminders` operational heartbeat recorded a start at `2026-09-27 19:30:00.869+00`, completion at `2026-09-27 19:30:09.924+00`, and the same completion time as its latest success.
- The successful heartbeat proves the production Worker accepted the scheduled authenticated request and completed the sweep. The secret value was not viewed or rotated.

## Delivery evidence

- From `2026-09-23 00:00:00+00` through the check, the delivery ledger contains one provider-confirmed `booking_reminder` delivery and zero failed reminder deliveries.
- The latest provider-confirmed reminder was delivered at `2026-09-25 17:00:16.903378+00`.
- Historical records in the preceding 30-day window contain 70 failed reminder deliveries: 67 provider bounce events on 22 September, two provider-reported unsuccessful deliveries on 22 September, and one legacy unfinished delivery on 8 September.
- Those historical failures are retained for audit. They must not be mass retried or deleted. They do not show a current scheduler or provider outage, because there have been zero failed reminder deliveries since 23 September and the later controlled delivery succeeded.

## Authentication setting

Supabase Authentication → Sign In / Providers shows **Confirm email** enabled. New password-based users must confirm their address before their first sign-in.

## Launch conclusion

The production scheduler, server-to-server authentication, Worker route, Resend path and provider webhook status update are operating. The remaining launch proof is operational: observe a reminder for an authorised real pilot appointment at the configured lead time, confirm receipt with the pilot salon/client, and keep that evidence without recording the recipient's personal data in the repository.

