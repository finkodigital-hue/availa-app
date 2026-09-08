-- Optional, consent-bound SMS appointment reminders. Provider credentials and full recipient numbers remain server-only.
alter table public.notification_preferences add column if not exists customer_booking_reminder_sms boolean not null default false;
alter table public.notification_deliveries drop constraint if exists notification_deliveries_channel_check;
alter table public.notification_deliveries add constraint notification_deliveries_channel_check check (channel in ('email','sms'));
alter table public.notification_deliveries drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check (status in ('queued','sending','sent','delivered','failed','suppressed'));
alter table public.bookings add column if not exists sms_reminder_consent_at timestamptz,
  add column if not exists sms_reminder_consent_version text,
  add column if not exists sms_reminder_sent_at timestamptz;
alter table public.bookings add constraint bookings_sms_consent_complete check (
  (sms_reminder_consent_at is null and sms_reminder_consent_version is null) or
  (sms_reminder_consent_at is not null and sms_reminder_consent_version = 'appointment-sms-v1'));
create index if not exists bookings_sms_reminder_due_idx on public.bookings (business_id, starts_at)
  where sms_reminder_consent_at is not null and sms_reminder_sent_at is null;
