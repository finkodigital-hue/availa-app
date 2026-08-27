-- Staff referenced by bookings cannot be hard-deleted without losing the
-- relationship that makes historical appointment records useful. Archiving
-- removes them from the product while retaining those joins.
alter table public.staff
  add column if not exists archived_at timestamptz;

create index if not exists idx_staff_business_unarchived
  on public.staff (business_id, active)
  where archived_at is null;

comment on column public.staff.archived_at is
  'When set, the staff member is removed from active product surfaces but retained for booking history.';
