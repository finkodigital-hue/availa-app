-- Allow a salon to collect an in-person consultation signature without first
-- creating an appointment. Signed evidence remains linked to the customer and
-- owning business, while booking-linked forms continue to work unchanged.

alter table public.consultation_submissions
  alter column booking_id drop not null;

create unique index consultation_submissions_one_walk_in_pending_idx
  on public.consultation_submissions (template_id, customer_id)
  where booking_id is null and status = 'pending';
