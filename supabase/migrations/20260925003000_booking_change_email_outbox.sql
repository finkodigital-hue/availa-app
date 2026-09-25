-- Record customer-facing booking changes without copying contact details into
-- another table. The sender resolves the current booking/customer at send time
-- and respects each business's outbound-email suppression switch.
create table public.booking_change_email_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  change_type text not null check (change_type in ('rescheduled','cancelled')),
  old_starts_at timestamptz not null,
  new_starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  manual_review boolean not null default false,
  last_error text
);

create index booking_change_email_outbox_due_idx
  on public.booking_change_email_outbox(next_attempt_at,created_at)
  where processed_at is null and manual_review = false;
create index booking_change_email_outbox_booking_idx
  on public.booking_change_email_outbox(booking_id,created_at desc);

alter table public.booking_change_email_outbox enable row level security;
revoke all on public.booking_change_email_outbox from public,anon,authenticated;
grant all on public.booking_change_email_outbox to service_role;

create function public.queue_booking_change_email()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.booking_change_email_outbox
      (booking_id,business_id,change_type,old_starts_at,new_starts_at)
    values (new.id,new.business_id,'cancelled',old.starts_at,new.starts_at);
  elsif new.starts_at is distinct from old.starts_at and new.status = 'confirmed' then
    insert into public.booking_change_email_outbox
      (booking_id,business_id,change_type,old_starts_at,new_starts_at)
    values (new.id,new.business_id,'rescheduled',old.starts_at,new.starts_at);
  end if;
  return new;
end $$;

create trigger queue_booking_change_email
after update of status,starts_at on public.bookings
for each row execute function public.queue_booking_change_email();

revoke all on function public.queue_booking_change_email() from public,anon,authenticated;
grant execute on function public.queue_booking_change_email() to service_role;
notify pgrst,'reload schema';
