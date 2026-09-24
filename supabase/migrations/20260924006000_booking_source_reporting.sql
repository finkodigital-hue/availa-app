-- Attribution is an allowlisted link label, not tracking cookies or a click count.
create table if not exists public.booking_sources (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  source text not null check (source in ('google', 'instagram')),
  recorded_at timestamptz not null default now()
);
alter table public.booking_sources enable row level security;
revoke all on public.booking_sources from public, anon, authenticated;
grant all on public.booking_sources to service_role;

create or replace function public.record_booking_source(p_booking_id uuid, p_business_id uuid, p_source text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_source not in ('google', 'instagram') or p_source is null then
    raise exception 'Invalid booking source';
  end if;
  if not exists (select 1 from public.bookings where id=p_booking_id and business_id=p_business_id) then
    raise exception 'Booking workspace mismatch';
  end if;
  insert into public.booking_sources(booking_id, source) values(p_booking_id,p_source)
    on conflict(booking_id) do nothing;
end;
$$;
revoke all on function public.record_booking_source(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_booking_source(uuid, uuid, text) to service_role;

create or replace function public.booking_source_report(p_business_id uuid)
returns table(source text, booking_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.businesses where id=p_business_id and owner_id=auth.uid()) then
    raise exception 'Only the business owner can view this report';
  end if;
  return query
    select coalesce(s.source,'unattributed'), count(*)
    from public.bookings b left join public.booking_sources s on s.booking_id=b.id
    where b.business_id=p_business_id and b.created_at >= now()-interval '30 days'
      and b.status in ('confirmed','checked_in','in_progress','completed')
    group by coalesce(s.source,'unattributed');
end;
$$;
revoke all on function public.booking_source_report(uuid) from public, anon;
grant execute on function public.booking_source_report(uuid) to authenticated;
