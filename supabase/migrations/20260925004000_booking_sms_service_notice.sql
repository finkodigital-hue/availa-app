-- A factual appointment reminder is a service message, not marketing consent.
-- Keep the old opt-in evidence for existing bookings; do not backfill this new
-- notice marker or unexpectedly message historic/imported customers.
alter table public.bookings
  add column if not exists sms_reminder_notice_at timestamptz,
  add column if not exists sms_reminder_notice_version text;

alter table public.bookings add constraint bookings_sms_notice_complete check (
  (sms_reminder_notice_at is null and sms_reminder_notice_version is null) or
  (sms_reminder_notice_at is not null and sms_reminder_notice_version = 'appointment-service-sms-v1'));

create index if not exists bookings_sms_service_reminder_due_idx
  on public.bookings (business_id, starts_at)
  where sms_reminder_sent_at is null
    and (sms_reminder_notice_at is not null or sms_reminder_consent_at is not null);

notify pgrst, 'reload schema';
