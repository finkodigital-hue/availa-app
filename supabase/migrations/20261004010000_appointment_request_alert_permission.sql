-- Existing requests only permitted a salon to contact the client manually.
-- Do not enroll them in automated opening alerts retroactively.
alter table public.appointment_waitlist_requests
  add column automatic_offer_email_opt_in_at timestamptz;

comment on column public.appointment_waitlist_requests.automatic_offer_email_opt_in_at is
  'Explicit, request-specific permission for an automated email about a matching appointment opening. Null means no automated alert.';

notify pgrst, 'reload schema';
