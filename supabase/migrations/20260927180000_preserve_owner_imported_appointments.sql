-- Preserve an existing diary only for owner-authorised Fresha imports.
-- INSERT only: subsequent rescheduling retains all ordinary scheduling checks.
alter table public.import_batches drop constraint import_batches_status_check;
alter table public.import_batches add constraint import_batches_status_check
 check (status in ('processing','completed','failed','rolled_back'));
alter table public.import_batches alter column status set default 'processing';

create function public.is_owner_booking_import(candidate public.bookings)
returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(auth.role()='authenticated' and auth.uid() is not null
  and candidate.import_batch_id is not null
  and nullif(btrim(candidate.external_id),'') is not null
  and candidate.source='manual' and candidate.notify_customer=false
  and candidate.confirmation_sent_at is not null
  and candidate.gap_min is null and candidate.active_after_min is null
  and exists (
   select 1 from public.import_batches batch
   join public.businesses business on business.id=batch.business_id
   where batch.id=candidate.import_batch_id and batch.business_id=candidate.business_id
    and batch.created_by=auth.uid() and business.owner_id=auth.uid()
    and business.deletion_requested_at is null
    and batch.entity_type='bookings' and batch.source='fresha'
    and batch.status='processing' and batch.row_count>0
  ),false);
$$;
revoke all on function public.is_owner_booking_import(public.bookings) from public,anon,authenticated;

create or replace function public.guard_booking_working_window() returns trigger
language plpgsql security definer set search_path=public as $$
declare b businesses%rowtype; sh staff_hours%rowtype; bh business_hours%rowtype;
 padded_start timestamptz;padded_end timestamptz;local_start timestamp;local_end timestamp;
 day_number integer;weeks_since integer;allowed boolean:=false;
begin
 if tg_op='INSERT' and public.is_owner_booking_import(new) then return new;end if;
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

create or replace function public.guard_booking_buffer_conflicts() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' and public.is_owner_booking_import(new) then return new;end if;
 if new.status='cancelled' then return new;end if;
 if tg_op='UPDATE' and old.status<>'cancelled' and row(new.staff_id,new.starts_at,new.ends_at,new.gap_min,new.active_after_min,new.service_id)
  is not distinct from row(old.staff_id,old.starts_at,old.ends_at,old.gap_min,old.active_after_min,old.service_id) then return new;end if;
 if new.gap_min is not null and new.ends_at-new.starts_at<=make_interval(mins=>new.gap_min+new.active_after_min) then raise exception 'Invalid appointment duration';end if;
 perform assert_no_booking_conflict(new.staff_id,new.starts_at-make_interval(mins=>new.buffer_before_min),
  new.ends_at+make_interval(mins=>new.buffer_after_min),new.gap_min,
  case when new.active_after_min is null then null else new.active_after_min+new.buffer_after_min end,new.id);
 return new;
end;$$;

create or replace function public.guard_booking_integrity() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and row(new.business_id,new.staff_id,new.service_id,new.customer_id,new.starts_at,new.ends_at,new.status,new.gap_min,new.active_after_min)
   is not distinct from row(old.business_id,old.staff_id,old.service_id,old.customer_id,old.starts_at,old.ends_at,old.status,old.gap_min,old.active_after_min) then return new;end if;
 if not exists(select 1 from staff where id=new.staff_id and business_id=new.business_id)
   or(new.service_id is not null and not exists(select 1 from services where id=new.service_id and business_id=new.business_id))
   or(new.customer_id is not null and not exists(select 1 from customers where id=new.customer_id and business_id=new.business_id)) then raise exception 'Booking references must belong to the same workspace';end if;
 if new.starts_at is null or new.ends_at is null or not isfinite(new.starts_at) or not isfinite(new.ends_at) or new.ends_at<=new.starts_at then raise exception 'Invalid appointment duration';end if;
 -- Tenant and duration checks above still apply to imports.
 if tg_op='INSERT' and public.is_owner_booking_import(new) then return new;end if;
 if new.status<>'cancelled' and (tg_op='INSERT' or old.status='cancelled' or
   row(new.staff_id,new.starts_at,new.ends_at,new.gap_min,new.active_after_min) is distinct from row(old.staff_id,old.starts_at,old.ends_at,old.gap_min,old.active_after_min))
 then perform assert_no_booking_conflict(new.staff_id,new.starts_at,new.ends_at,new.gap_min,new.active_after_min,new.id);end if;
 return new;
end;$$;

notify pgrst,'reload schema';
