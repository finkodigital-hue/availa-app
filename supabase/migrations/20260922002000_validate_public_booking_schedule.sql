-- Keep scheduling decisions authoritative even when callers bypass the UI.
create or replace function public.validate_public_booking_slot(
  p_business_id uuid, p_service_id uuid, p_staff_id uuid,
  p_starts_at timestamptz, p_exclude_booking_id uuid default null
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  b businesses%rowtype;
  s services%rowtype;
  sh staff_hours%rowtype;
  bh business_hours%rowtype;
  finish timestamptz;
  padded_start timestamptz;
  padded_end timestamptz;
  local_start timestamp;
  local_end timestamp;
  day_number integer;
  weeks_since integer;
  allowed boolean := false;
begin
  if p_starts_at is null or not isfinite(p_starts_at)
     or p_starts_at < now() or p_starts_at > now() + interval '365 days' then
    raise exception 'Choose a future appointment within the next year';
  end if;
  select * into b from businesses where id=p_business_id and deletion_requested_at is null;
  if not found then raise exception 'This business is unavailable'; end if;
  select * into s from services where id=p_service_id and business_id=b.id and active;
  if not found then raise exception 'This service is unavailable'; end if;
  if not exists(select 1 from staff where id=p_staff_id and business_id=b.id and active and bookable) then
    raise exception 'This team member is unavailable';
  end if;
  if exists(select 1 from service_staff where service_id=s.id)
     and not exists(select 1 from service_staff where service_id=s.id and staff_id=p_staff_id and business_id=b.id) then
    raise exception 'This team member does not offer this service';
  end if;
  finish := p_starts_at + make_interval(mins=>s.duration_minutes+coalesce(s.gap_min,0)+coalesce(s.active_after_min,0));
  padded_start := p_starts_at - make_interval(mins=>coalesce(s.buffer_before_min,0));
  padded_end := finish + make_interval(mins=>coalesce(s.buffer_after_min,0));
  local_start := padded_start at time zone coalesce(nullif(b.timezone,''),'Europe/London');
  local_end := padded_end at time zone coalesce(nullif(b.timezone,''),'Europe/London');
  if local_start::date <> local_end::date or padded_end <= padded_start then
    raise exception 'This appointment does not fit within opening hours';
  end if;
  day_number := extract(dow from local_start)::integer;
  if exists(select 1 from holiday_closures where business_id=b.id and local_start::date between starts_on and ends_on) then
    raise exception 'The business is closed on this date';
  end if;
  select * into sh from staff_hours where staff_id=p_staff_id and business_id=b.id and weekday=day_number;
  if found then
    weeks_since := floor((local_start::date-sh.repeat_anchor)::numeric/7)::integer;
    allowed := not sh.closed and local_start::time >= sh.open_time and local_end::time <= sh.close_time
      and (sh.repeat_weeks <= 1 or (weeks_since >= 0 and mod(weeks_since,sh.repeat_weeks)=0));
  elsif exists(select 1 from business_hour_periods where business_id=b.id and weekday=day_number) then
    allowed := exists(select 1 from business_hour_periods where business_id=b.id and weekday=day_number
      and local_start::time >= open_time and local_end::time <= close_time);
  else
    select * into bh from business_hours where business_id=b.id and weekday=day_number;
    if found then
      allowed := not bh.closed and local_start::time >= bh.open_time and local_end::time <= bh.close_time;
    else
      allowed := day_number <> 0 and local_start::time >= time '09:00' and local_end::time <= time '18:00';
    end if;
  end if;
  if allowed is not true then raise exception 'This appointment is outside working hours'; end if;
  if exists(
    select 1 from blocked_dates d where d.business_id=b.id and (d.staff_id is null or d.staff_id=p_staff_id)
    and ((d.starts_at < case when s.gap_min is null then padded_end else p_starts_at+make_interval(mins=>s.duration_minutes) end
          and d.ends_at > padded_start)
      or (s.gap_min is not null and d.starts_at < padded_end and d.ends_at > finish-make_interval(mins=>s.active_after_min)))
  ) then raise exception 'This time is unavailable'; end if;
  perform assert_no_booking_conflict(p_staff_id,padded_start,padded_end,s.gap_min,
    case when s.active_after_min is null then null else s.active_after_min+coalesce(s.buffer_after_min,0) end,p_exclude_booking_id);
  return finish;
end;
$$;
revoke all on function public.validate_public_booking_slot(uuid,uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.validate_public_booking_slot(uuid,uuid,uuid,timestamptz,uuid) to service_role;

-- Preserve the existing rate limits, customer matching and server price snapshot.
-- The internal implementation is callable only by trusted database routines.
alter function public.create_public_booking(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,integer)
  rename to create_public_booking_validated_internal;
revoke all on function public.create_public_booking_validated_internal(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,integer) from public,anon,authenticated;

create function public.create_public_booking(
 p_business_id uuid,p_service_id uuid,p_staff_id uuid,p_customer_name text,
 p_customer_email text,p_customer_phone text,p_starts_at timestamptz,p_ends_at timestamptz,
 p_notes text,p_gap_min integer default null,p_active_after_min integer default null
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform validate_public_booking_slot(p_business_id,p_service_id,p_staff_id,p_starts_at);
  if exists(select 1 from businesses where id=p_business_id and coalesce(payment_mode,'none') <> 'none') then
    raise exception 'Online payment is required for this booking';
  end if;
  return create_public_booking_validated_internal(p_business_id,p_service_id,p_staff_id,p_customer_name,
    p_customer_email,p_customer_phone,p_starts_at,p_ends_at,p_notes,p_gap_min,p_active_after_min);
end;
$$;
revoke all on function public.create_public_booking(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,integer) from public;
grant execute on function public.create_public_booking(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer,integer) to anon,authenticated,service_role;
notify pgrst,'reload schema';
