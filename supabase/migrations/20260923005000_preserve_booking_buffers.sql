-- Snapshot preparation/cleanup time so later service edits cannot change an
-- existing appointment or an in-flight paid reservation's occupied time.
alter table public.bookings
 add column buffer_before_min integer not null default 0 check(buffer_before_min>=0),
 add column buffer_after_min integer not null default 0 check(buffer_after_min>=0);
alter table public.booking_checkout_holds
 add column buffer_before_min integer not null default 0 check(buffer_before_min>=0),
 add column buffer_after_min integer not null default 0 check(buffer_after_min>=0);
-- Earlier appointments have no historical buffer snapshot. Use the current
-- service configuration once, without moving or cancelling any appointment.
do $$ declare previous_claims text:=current_setting('request.jwt.claims',true);
 previous_role text:=current_setting('request.jwt.claim.role',true);
begin
 -- This one-time SQL migration performs server maintenance, not a customer
 -- edit. Preserve and restore the caller context before installing controls.
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform set_config('request.jwt.claim.role','service_role',true);
 update public.bookings b set buffer_before_min=greatest(0,coalesce(s.buffer_before_min,0)),
  buffer_after_min=greatest(0,coalesce(s.buffer_after_min,0)) from public.services s where b.service_id=s.id;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
 perform set_config('request.jwt.claim.role',coalesce(previous_role,''),true);
end;$$;
update public.booking_checkout_holds h set buffer_before_min=greatest(0,coalesce(s.buffer_before_min,0)),
 buffer_after_min=greatest(0,coalesce(s.buffer_after_min,0)) from public.services s where h.service_id=s.id;

create function public.snapshot_booking_buffers() returns trigger
language plpgsql security definer set search_path=public as $$
declare held booking_checkout_holds%rowtype;
begin
 if tg_op='UPDATE' and new.service_id is not distinct from old.service_id then
  if new.buffer_before_min is distinct from old.buffer_before_min or new.buffer_after_min is distinct from old.buffer_after_min then
   raise exception 'Appointment buffers are managed by the booking service';
  end if;
  return new;
 end if;
 if tg_table_name='bookings' and nullif(current_setting('bookzenvo.checkout_hold',true),'') is not null then
  select * into held from booking_checkout_holds where id::text=current_setting('bookzenvo.checkout_hold',true);
  if not found or row(held.business_id,held.service_id,held.staff_id,held.starts_at,held.ends_at)
    is distinct from row(new.business_id,new.service_id,new.staff_id,new.starts_at,new.ends_at) then
   raise exception 'Appointment reservation mismatch';
  end if;
  new.buffer_before_min:=held.buffer_before_min;new.buffer_after_min:=held.buffer_after_min;
 else
  select greatest(0,coalesce(s.buffer_before_min,0)),greatest(0,coalesce(s.buffer_after_min,0))
   into new.buffer_before_min,new.buffer_after_min from services s where s.id=new.service_id and s.business_id=new.business_id;
  if not found then new.buffer_before_min:=0;new.buffer_after_min:=0;end if;
 end if;
 return new;
end;$$;
revoke all on function public.snapshot_booking_buffers() from public,anon,authenticated;
create trigger aa_snapshot_booking_buffers before insert or update on public.bookings for each row execute function public.snapshot_booking_buffers();
create trigger aa_snapshot_booking_buffers before insert on public.booking_checkout_holds for each row execute function public.snapshot_booking_buffers();

-- Candidate parameters retain their existing meaning: callers may already
-- pad the first/last edges. Stored appointments and holds now pad their own.
create or replace function public.assert_no_booking_conflict(p_staff_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,
 p_gap_min integer,p_active_after_min integer,p_exclude_booking_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_staff_id is null or p_starts_at is null or p_ends_at is null
  or not isfinite(p_starts_at) or not isfinite(p_ends_at) or p_ends_at<=p_starts_at
  or ((p_gap_min is null)<>(p_active_after_min is null))
  or (p_gap_min is not null and (p_gap_min<=0 or p_active_after_min<=0 or p_ends_at-p_starts_at<=make_interval(mins=>p_gap_min+p_active_after_min))) then
  raise exception 'Invalid appointment duration';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_staff_id::text));
 if exists(
  with candidate as (
   select p_starts_at as starts,case when p_gap_min is null then p_ends_at else p_ends_at-make_interval(mins=>p_gap_min+p_active_after_min) end as ends
   union all select p_ends_at-make_interval(mins=>p_active_after_min),p_ends_at where p_gap_min is not null
  ), occupied as (
   select b.starts_at,b.ends_at,b.gap_min,b.active_after_min,b.buffer_before_min,b.buffer_after_min from bookings b
    where b.staff_id=p_staff_id and b.status<>'cancelled' and (p_exclude_booking_id is null or b.id<>p_exclude_booking_id)
   union all
   select h.starts_at,h.ends_at,h.gap_min,h.active_after_min,h.buffer_before_min,h.buffer_after_min from booking_checkout_holds h
    where h.staff_id=p_staff_id and h.expires_at>now() and h.fulfilled_booking_id is null
     and h.id::text is distinct from nullif(current_setting('bookzenvo.checkout_hold',true),'')
  ), segments as (
   select starts_at-make_interval(mins=>buffer_before_min) as starts,
    case when gap_min is null then ends_at+make_interval(mins=>buffer_after_min) else ends_at-make_interval(mins=>gap_min+active_after_min) end as ends from occupied
   union all select ends_at-make_interval(mins=>active_after_min),ends_at+make_interval(mins=>buffer_after_min) from occupied where gap_min is not null
  ) select 1 from candidate c join segments s on s.starts<c.ends and s.ends>c.starts
 ) then raise exception 'SLOT_TAKEN';end if;
end;$$;

-- Runs for raw staff writes as well as the public/portal/paid RPC paths.
-- Exclude the row itself; the existing integrity trigger still enforces tenant
-- references. No appointment is moved merely because a service is edited.
create function public.guard_booking_buffer_conflicts() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='cancelled' then return new;end if;
 if tg_op='UPDATE' and old.status<>'cancelled' and row(new.staff_id,new.starts_at,new.ends_at,new.gap_min,new.active_after_min,new.service_id)
  is not distinct from row(old.staff_id,old.starts_at,old.ends_at,old.gap_min,old.active_after_min,old.service_id) then return new;end if;
 if new.gap_min is not null and new.ends_at-new.starts_at<=make_interval(mins=>new.gap_min+new.active_after_min) then raise exception 'Invalid appointment duration';end if;
 perform assert_no_booking_conflict(new.staff_id,new.starts_at-make_interval(mins=>new.buffer_before_min),
  new.ends_at+make_interval(mins=>new.buffer_after_min),new.gap_min,
  case when new.active_after_min is null then null else new.active_after_min+new.buffer_after_min end,new.id);
 return new;
end;$$;
revoke all on function public.guard_booking_buffer_conflicts() from public,anon,authenticated;
create trigger guard_booking_buffer_conflicts before insert or update on public.bookings for each row execute function public.guard_booking_buffer_conflicts();

create or replace view public.public_booking_slots with(security_invoker=off) as
 select bk.business_id,bk.staff_id,bk.starts_at,bk.ends_at,bk.gap_min,bk.active_after_min,bk.buffer_before_min,bk.buffer_after_min,
 bk.starts_at-make_interval(mins=>bk.buffer_before_min) as occupied_starts_at,bk.ends_at+make_interval(mins=>bk.buffer_after_min) as occupied_ends_at
 from bookings bk join businesses b on b.id=bk.business_id where bk.status<>'cancelled' and b.deletion_requested_at is null
 union all
 select h.business_id,h.staff_id,h.starts_at,h.ends_at,h.gap_min,h.active_after_min,h.buffer_before_min,h.buffer_after_min,
 h.starts_at-make_interval(mins=>h.buffer_before_min),h.ends_at+make_interval(mins=>h.buffer_after_min)
 from booking_checkout_holds h join businesses b on b.id=h.business_id
 where h.expires_at>now() and h.fulfilled_booking_id is null and b.deletion_requested_at is null;
notify pgrst,'reload schema';
