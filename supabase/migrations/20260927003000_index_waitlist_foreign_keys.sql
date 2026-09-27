-- Cover appointment waitlist foreign keys so deletes/updates of referenced
-- services and staff do not require a full waitlist scan.
create index if not exists appointment_waitlist_requests_service_id_idx
  on public.appointment_waitlist_requests (service_id);

create index if not exists appointment_waitlist_requests_preferred_staff_id_idx
  on public.appointment_waitlist_requests (preferred_staff_id);
