-- Manual creation, direct writes, drag, resize and undo must respect the
-- same working calendar as public booking. Historical records remain editable
-- without rewriting past working hours; no future scheduling override exists.
create function public.guard_booking_working_window() returns trigger
language plpgsql security definer set search_path=public as $$
declare b businesses%rowtype; sh staff_hours%rowtype; bh business_hours%rowtype;
 padded_start timestamptz;padded_end timestamptz;local_start timestamp;local_end timestamp;
 day_number integer;weeks_since integer;allowed boolean:=false;
begin
 if new.status='cancelled' then return new;end if;
 if tg_op='UPDATE' and old.status<>'cancelled' and row(new.business_id,new.staff_id,new.service_id,new.starts_at,new.ends_at,new.gap_min,new.active_after_min)
  is not distinct from row(old.business_id,old.staff_id,old.service_id,old.starts_at,old.ends_at,old.gap_min,old.active_after_min) then return new;end if;
 if new.ends_at<=now() then return new;end if;
 -- An accepted paid reservation keeps its original schedule even if opening
 -- hours change while the customer pays. The earlier snapshot trigger checks
 -- every hold identity/time field; conflict and tenant checks still run.
 if tg_op='INSERT' and nullif(current_setting('bookzenvo.checkout_hold',true),'') is not null then return new;end if;
 select * into b from businesses where id=new.business_id and deletion_requested_at is null;
 if not found then raise exception 'This business is unavailable';end if;
 if not exists(select 1 from staff where id=new.staff_id and business_id=b.id and active and (new.service_id is null or bookable)) then
  raise exception 'This team member is unavailable';end if;
 if new.service_id is not null then
  if not exists(select 1 from services where id=new.service_id and business_id=b.id and active) then raise exception 'This service is unavailable';end if;
  if exists(select 1 from service_staff where service_id=new.service_id)
   and not exists(select 1 from service_staff where service_id=new.service_id and staff_id=new.staff_id and business_id=b.id) then
   raise exception 'This team member does not offer this service';end if;
 end if;
 padded_start:=new.starts_at-make_interval(mins=>new.buffer_before_min);
 padded_end:=new.ends_at+make_interval(mins=>new.buffer_after_min);
 local_start:=padded_start at time zone coalesce(nullif(b.timezone,''),'Europe/London');
 local_end:=padded_end at time zone coalesce(nullif(b.timezone,''),'Europe/London');
 if local_start::date<>local_end::date then raise exception 'This appointment does not fit within opening hours';end if;
 day_number:=extract(dow from local_start)::integer;
 if exists(select 1 from holiday_closures where business_id=b.id and local_start::date between starts_on and ends_on) then raise exception 'The business is closed on this date';end if;
 select * into sh from staff_hours where staff_id=new.staff_id and business_id=b.id and weekday=day_number;
 if found then
  weeks_since:=floor((local_start::date-sh.repeat_anchor)::numeric/7)::integer;
  allowed:=not sh.closed and local_start::time>=sh.open_time and local_end::time<=sh.close_time
   and (sh.repeat_weeks<=1 or (weeks_since>=0 and mod(weeks_since,sh.repeat_weeks)=0));
 elsif exists(select 1 from business_hour_periods where business_id=b.id and weekday=day_number) then
  allowed:=exists(select 1 from business_hour_periods where business_id=b.id and weekday=day_number and local_start::time>=open_time and local_end::time<=close_time);
 else
  select * into bh from business_hours where business_id=b.id and weekday=day_number;
  if found then allowed:=not bh.closed and local_start::time>=bh.open_time and local_end::time<=bh.close_time;
  else allowed:=day_number<>0 and local_start::time>=time '09:00' and local_end::time<=time '18:00';end if;
 end if;
 if allowed is not true then raise exception 'This appointment is outside working hours';end if;
 if exists(select 1 from blocked_dates d where d.business_id=b.id and (d.staff_id is null or d.staff_id=new.staff_id)
  and ((d.starts_at<case when new.gap_min is null then padded_end else new.ends_at-make_interval(mins=>new.gap_min+new.active_after_min) end and d.ends_at>padded_start)
   or (new.gap_min is not null and d.starts_at<padded_end and d.ends_at>new.ends_at-make_interval(mins=>new.active_after_min)))) then
  raise exception 'This time is unavailable';end if;
 return new;
end;$$;
revoke all on function public.guard_booking_working_window() from public,anon,authenticated;
create trigger guard_booking_working_window before insert or update on public.bookings for each row execute function public.guard_booking_working_window();
notify pgrst,'reload schema';
