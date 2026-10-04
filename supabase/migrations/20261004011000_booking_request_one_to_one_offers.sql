-- One customer receives an opening at a time. Reuse checkout holds so every
-- public availability read and the booking conflict guard see the same hold.
-- Only new requests with explicit automated-email permission are eligible.
create table public.appointment_waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.appointment_waitlist_requests(id) on delete cascade,
  cancelled_booking_id uuid not null references public.bookings(id),
  starts_at timestamptz not null,
  hold_id uuid not null unique references public.booking_checkout_holds(id),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'reserved' check (status in ('reserved','sent','checkout','accepted','failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_booking_id uuid references public.bookings(id),
  unique (request_id,cancelled_booking_id,starts_at)
);
create index appointment_waitlist_offers_slot_queue
  on public.appointment_waitlist_offers(cancelled_booking_id,created_at);
alter table public.appointment_waitlist_offers enable row level security;
revoke all on public.appointment_waitlist_offers from public,anon,authenticated;
grant all on public.appointment_waitlist_offers to service_role;
create policy "offer records stay server-side" on public.appointment_waitlist_offers
  for all to anon,authenticated using (false) with check (false);

-- A durable cancellation event prevents older openings from being starved by
-- a fixed-size scan of the bookings table on every cron tick.
create table public.appointment_opening_events (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.appointment_opening_events enable row level security;
revoke all on public.appointment_opening_events from public,anon,authenticated;
grant all on public.appointment_opening_events to service_role;
create policy "opening events stay server-side" on public.appointment_opening_events
  for all to anon,authenticated using (false) with check (false);

create function public.queue_appointment_opening()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status<>'cancelled' and new.status='cancelled' and new.starts_at>now()
     and exists(select 1 from public.appointment_waitlist_requests r
       where r.business_id=new.business_id and r.service_id=new.service_id
         and r.status='active' and r.automatic_offer_email_opt_in_at is not null
         and new.starts_at>=r.preferred_after and new.ends_at<=r.preferred_before) then
    insert into public.appointment_opening_events(booking_id,created_at,processed_at)
      values(new.id,now(),null)
      on conflict(booking_id) do update set created_at=excluded.created_at,processed_at=null;
  end if;
  return new;
end;$$;
revoke all on function public.queue_appointment_opening() from public,anon,authenticated;
create trigger queue_appointment_opening after update of status on public.bookings
  for each row execute function public.queue_appointment_opening();

create function public.reserve_appointment_waitlist_offer(
  p_request_id uuid,p_cancelled_booking_id uuid,p_token_hash text,p_contact_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r public.appointment_waitlist_requests%rowtype;
  old_booking public.bookings%rowtype;
  b public.businesses%rowtype;
  s public.services%rowtype;
  h public.booking_checkout_holds%rowtype;
  o public.appointment_waitlist_offers%rowtype;
  local_hour integer;
  finish timestamptz;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_contact_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid offer identity';
  end if;
  select * into r from public.appointment_waitlist_requests where id=p_request_id for update;
  if not found or r.status<>'active' or r.automatic_offer_email_opt_in_at is null
     or r.preferred_before<=now() or r.created_at<now()-interval '90 days' then
    raise exception 'Request is not eligible';
  end if;
  select * into old_booking from public.bookings where id=p_cancelled_booking_id;
  if not found or old_booking.status<>'cancelled' or old_booking.business_id<>r.business_id
     or old_booking.service_id<>r.service_id or old_booking.starts_at<=now()+interval '20 minutes'
     or old_booking.starts_at<r.preferred_after or old_booking.ends_at>r.preferred_before
     or (r.preferred_staff_id is not null and r.preferred_staff_id<>old_booking.staff_id) then
    raise exception 'Opening does not match request';
  end if;
  if exists(select 1 from public.appointment_waitlist_offers
    where request_id=r.id and cancelled_booking_id=old_booking.id and starts_at=old_booking.starts_at) then
    raise exception 'This opening was already offered';
  end if;
  if exists(select 1 from public.appointment_waitlist_offers o2
    join public.booking_checkout_holds h2 on h2.id=o2.hold_id
    where o2.request_id=r.id and h2.expires_at>now() and h2.fulfilled_booking_id is null) then
    raise exception 'Another offer is still active';
  end if;
  if exists(select 1 from public.bookings existing
    where existing.business_id=r.business_id and existing.service_id=r.service_id
      and existing.status<>'cancelled' and lower(existing.customer_email)=lower(r.customer_email)
      and existing.starts_at>=r.preferred_after and existing.ends_at<=r.preferred_before) then
    raise exception 'Customer already has a matching booking';
  end if;
  select * into b from public.businesses where id=r.business_id and deletion_requested_at is null;
  select * into s from public.services where id=r.service_id and business_id=r.business_id and active;
  if b.id is null or s.id is null or coalesce(b.email_suppressed,false) then
    raise exception 'Salon cannot send this offer';
  end if;
  local_hour:=extract(hour from old_booking.starts_at at time zone coalesce(nullif(b.timezone,''),'Europe/London'));
  if (r.preferred_time='morning' and local_hour>=12)
    or (r.preferred_time='afternoon' and (local_hour<12 or local_hour>=17))
    or (r.preferred_time='evening' and local_hour<17) then
    raise exception 'Opening does not match time of day';
  end if;
  -- Serialise with both checkout reservations and staff bookings. The final
  -- slot check runs under the staff lock; a cancelled row alone proves nothing.
  perform pg_advisory_xact_lock(hashtext('checkout:'||b.id::text));
  perform pg_advisory_xact_lock(hashtext(old_booking.staff_id::text));
  finish:=public.validate_public_booking_slot(b.id,s.id,old_booking.staff_id,old_booking.starts_at);
  insert into public.booking_checkout_holds
    (business_id,service_id,staff_id,request_key,contact_key,starts_at,ends_at,
     gap_min,active_after_min,price_cents,amount_cents,currency,payment_mode,expires_at)
  values
    (b.id,s.id,old_booking.staff_id,p_token_hash,p_contact_hash,old_booking.starts_at,finish,
     s.gap_min,s.active_after_min,s.price_cents,0,lower(b.currency),'better_time_offer',now()+interval '15 minutes')
  returning * into h;
  insert into public.appointment_waitlist_offers
    (request_id,cancelled_booking_id,starts_at,hold_id,token_hash,expires_at)
  values(r.id,old_booking.id,old_booking.starts_at,h.id,p_token_hash,h.expires_at) returning * into o;
  return jsonb_build_object('offer_id',o.id,'business_id',b.id,'business_name',b.name,
    'business_slug',b.slug,'service_name',s.name,'starts_at',h.starts_at,
    'timezone',coalesce(nullif(b.timezone,''),'Europe/London'),
    'customer_email',r.customer_email,'expires_at',o.expires_at);
end;$$;
revoke all on function public.reserve_appointment_waitlist_offer(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_appointment_waitlist_offer(uuid,uuid,text,text) to service_role;

-- If delivery fails or is suppressed, free the slot immediately. Never leave
-- a customer without an email while their requested time is being held.
create function public.finish_appointment_waitlist_offer_delivery(p_offer_id uuid,p_sent boolean)
returns void language plpgsql security definer set search_path=public as $$
declare o public.appointment_waitlist_offers%rowtype;
begin
  select * into o from public.appointment_waitlist_offers where id=p_offer_id for update;
  if not found or o.status<>'reserved' then return;end if;
  if p_sent then
    update public.appointment_waitlist_offers set status='sent',sent_at=now() where id=o.id;
  else
    update public.appointment_waitlist_offers set status='failed',expires_at=now() where id=o.id;
    update public.booking_checkout_holds set expires_at=now() where id=o.hold_id and fulfilled_booking_id is null;
  end if;
end;$$;
revoke all on function public.finish_appointment_waitlist_offer_delivery(uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_appointment_waitlist_offer_delivery(uuid,boolean) to service_role;

-- The token is a bearer secret known only to the recipient. Both a free
-- booking and a paid checkout must use their own hold as an exclusion while
-- validating the slot, and may consume the offer only once.
create function public.accept_appointment_waitlist_offer_free(p_token_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare o public.appointment_waitlist_offers%rowtype;h public.booking_checkout_holds%rowtype;
  r public.appointment_waitlist_requests%rowtype;booking_id uuid;
begin
  select * into o from public.appointment_waitlist_offers where token_hash=p_token_hash for update;
  if not found or o.status not in('reserved','sent') or o.expires_at<=now() then raise exception 'This offer has expired';end if;
  select * into h from public.booking_checkout_holds where id=o.hold_id for update;
  select * into r from public.appointment_waitlist_requests where id=o.request_id for update;
  if h.expires_at<=now() or h.fulfilled_booking_id is not null or r.status<>'active'
     or r.automatic_offer_email_opt_in_at is null then raise exception 'This offer is no longer available';end if;
  if not exists(select 1 from public.businesses where id=h.business_id and payment_mode='none' and deletion_requested_at is null) then
    raise exception 'This offer requires checkout';
  end if;
  perform pg_advisory_xact_lock(hashtext(h.staff_id::text));
  perform set_config('bookzenvo.checkout_hold',h.id::text,true);
  booking_id:=public.create_public_booking(h.business_id,h.service_id,h.staff_id,
    r.customer_name,r.customer_email,coalesce(r.customer_phone,''),h.starts_at,h.ends_at,'',h.gap_min,h.active_after_min);
  update public.booking_checkout_holds set fulfilled_booking_id=booking_id where id=h.id;
  update public.appointment_waitlist_offers set status='accepted',accepted_booking_id=booking_id where id=o.id;
  update public.appointment_waitlist_requests set status='closed' where id=r.id;
  update public.appointment_opening_events e set processed_at=now() where e.booking_id=o.cancelled_booking_id;
  perform set_config('bookzenvo.checkout_hold','',true);
  return booking_id;
end;$$;
revoke all on function public.accept_appointment_waitlist_offer_free(text) from public,anon,authenticated;
grant execute on function public.accept_appointment_waitlist_offer_free(text) to service_role;

-- A paid offer is converted into the existing 45-minute Stripe checkout hold.
-- The same row stays visible to the normal availability checker throughout.
create function public.accept_appointment_waitlist_offer_checkout(
  p_token_hash text,p_business_id uuid,p_service_id uuid,p_staff_id uuid,
  p_starts_at timestamptz,p_contact_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.appointment_waitlist_offers%rowtype;h public.booking_checkout_holds%rowtype;
  r public.appointment_waitlist_requests%rowtype;b public.businesses%rowtype;
  s public.services%rowtype;amount integer;
begin
  select * into o from public.appointment_waitlist_offers where token_hash=p_token_hash for update;
  if not found or o.status not in('reserved','sent','checkout') or o.expires_at<=now() then raise exception 'This offer has expired';end if;
  select * into h from public.booking_checkout_holds where id=o.hold_id for update;
  select * into r from public.appointment_waitlist_requests where id=o.request_id for update;
  if h.expires_at<=now() or h.fulfilled_booking_id is not null or r.status<>'active'
     or r.automatic_offer_email_opt_in_at is null
     or row(h.business_id,h.service_id,h.staff_id,h.starts_at,h.contact_key)
       is distinct from row(p_business_id,p_service_id,p_staff_id,p_starts_at,p_contact_hash) then
    raise exception 'This offer is no longer available';
  end if;
  select * into b from public.businesses where id=h.business_id and deletion_requested_at is null;
  select * into s from public.services where id=h.service_id and business_id=h.business_id and active;
  if b.id is null or s.id is null or b.payment_mode not in('full','deposit')
     or b.stripe_account_id is null or not coalesce(b.stripe_charges_enabled,false) then
    raise exception 'Online payment is unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtext(h.staff_id::text));
  perform set_config('bookzenvo.checkout_hold',h.id::text,true);
  perform public.validate_public_booking_slot(h.business_id,h.service_id,h.staff_id,h.starts_at);
  perform set_config('bookzenvo.checkout_hold','',true);
  amount:=case when b.payment_mode='full' then s.price_cents else round(s.price_cents*b.deposit_percent/100.0) end;
  if amount<50 then raise exception 'This amount is too small for online payment';end if;
  update public.booking_checkout_holds set price_cents=s.price_cents,amount_cents=amount,
    currency=lower(b.currency),payment_mode=b.payment_mode,expires_at=now()+interval '45 minutes'
    where id=h.id returning * into h;
  update public.appointment_waitlist_offers set status='checkout',expires_at=h.expires_at where id=o.id;
  return to_jsonb(h);
end;$$;
revoke all on function public.accept_appointment_waitlist_offer_checkout(text,uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.accept_appointment_waitlist_offer_checkout(text,uuid,uuid,uuid,timestamptz,text) to service_role;

create function public.complete_appointment_waitlist_offer_checkout()
returns trigger language plpgsql security definer set search_path=public as $$
declare o public.appointment_waitlist_offers%rowtype;
begin
  if new.fulfilled_booking_id is null or old.fulfilled_booking_id is not null then return new;end if;
  select * into o from public.appointment_waitlist_offers where hold_id=new.id for update;
  if found then
    update public.appointment_waitlist_offers set status='accepted',accepted_booking_id=new.fulfilled_booking_id where id=o.id;
    update public.appointment_waitlist_requests set status='closed' where id=o.request_id;
    update public.appointment_opening_events e set processed_at=now() where e.booking_id=o.cancelled_booking_id;
  end if;
  return new;
end;$$;
revoke all on function public.complete_appointment_waitlist_offer_checkout() from public,anon,authenticated;
create trigger complete_appointment_waitlist_offer_checkout after update of fulfilled_booking_id
  on public.booking_checkout_holds for each row execute function public.complete_appointment_waitlist_offer_checkout();

create function public.stop_appointment_waitlist_offer_alerts(p_token_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
declare o public.appointment_waitlist_offers%rowtype;
begin
  select * into o from public.appointment_waitlist_offers where token_hash=p_token_hash for update;
  if not found then return false;end if;
  update public.appointment_waitlist_requests set status='closed' where id=o.request_id;
  update public.booking_checkout_holds h set expires_at=now()
    from public.appointment_waitlist_offers other
    where other.request_id=o.request_id and other.hold_id=h.id
      and other.status in('reserved','sent') and h.fulfilled_booking_id is null;
  return true;
end;$$;
revoke all on function public.stop_appointment_waitlist_offer_alerts(text) from public,anon,authenticated;
grant execute on function public.stop_appointment_waitlist_offer_alerts(text) to service_role;

notify pgrst,'reload schema';
