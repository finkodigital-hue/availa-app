-- Record how an owner handled a booking request without implying that
-- contacting a client created a booking or sent a message.
alter table public.appointment_waitlist_requests
  add column if not exists resolution text
  check (resolution in ('booked', 'contacted', 'unavailable'));

alter table public.appointment_waitlist_requests
  add constraint appointment_request_resolution_requires_closed
  check (status = 'closed' or resolution is null);

grant update (status, resolution) on public.appointment_waitlist_requests to authenticated;

comment on column public.appointment_waitlist_requests.resolution is
  'Owner-recorded outcome only; no booking or customer message is created by this field.';

notify pgrst, 'reload schema';
