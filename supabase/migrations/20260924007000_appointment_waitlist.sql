-- Appointment requests are separate from the Bookzenvo launch waitlist.
-- This feature only records interest. It never reserves a slot or contacts anyone.
create table public.appointment_waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null references public.services(id),
  preferred_staff_id uuid references public.staff(id),
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_email text not null check (length(customer_email) between 3 and 254),
  customer_phone text,
  preferred_after timestamptz not null,
  preferred_before timestamptz not null,
  preferred_time text not null default 'any' check (preferred_time in ('any','morning','afternoon','evening')),
  status text not null default 'active' check (status in ('active','closed')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- 61 salon calendar days can span 61 days + 1 hour at a DST fall-back.
  constraint appointment_waitlist_window check (preferred_before > preferred_after and preferred_before <= preferred_after + interval '62 days')
);

create index appointment_waitlist_active_lookup
  on public.appointment_waitlist_requests (business_id,service_id,preferred_after,preferred_before)
  where status = 'active';

alter table public.appointment_waitlist_requests enable row level security;
revoke all on public.appointment_waitlist_requests from public,anon,authenticated;
grant select,update(status) on public.appointment_waitlist_requests to authenticated;
grant all on public.appointment_waitlist_requests to service_role;

create policy "owners review appointment waitlist" on public.appointment_waitlist_requests
  for select to authenticated using (public.is_business_owner(business_id));
create policy "owners close appointment waitlist requests" on public.appointment_waitlist_requests
  for update to authenticated using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- A service-role writer is still constrained to this salon's catalogue.
create function public.validate_appointment_waitlist_request()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (select 1 from public.services s where s.id=new.service_id
    and s.business_id=new.business_id and s.active) then
    raise exception 'Invalid waitlist service';
  end if;
  if new.preferred_staff_id is not null and not exists (
    select 1 from public.staff s where s.id=new.preferred_staff_id
      and s.business_id=new.business_id and s.active and s.bookable
  ) then
    raise exception 'Invalid waitlist staff';
  end if;
  return new;
end;$$;
create trigger validate_appointment_waitlist_request
  before insert or update of business_id,service_id,preferred_staff_id
  on public.appointment_waitlist_requests
  for each row execute function public.validate_appointment_waitlist_request();

notify pgrst,'reload schema';
