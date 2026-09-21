create table public.booking_checkout_holds (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),
 service_id uuid not null references services(id),staff_id uuid not null references staff(id),
 request_key text not null,contact_key text not null,starts_at timestamptz not null,ends_at timestamptz not null,
 gap_min integer,active_after_min integer,price_cents integer not null,amount_cents integer not null,
 currency text not null,payment_mode text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '45 minutes',
 fulfilled_booking_id uuid references bookings(id)
);
create index booking_checkout_holds_active on booking_checkout_holds(staff_id,expires_at);
create index booking_checkout_holds_contact on booking_checkout_holds(business_id,contact_key,created_at);
alter table public.booking_checkout_holds enable row level security;
revoke all on booking_checkout_holds from public,anon,authenticated;
grant all on booking_checkout_holds to service_role;
create or replace view public.public_booking_slots with(security_invoker=off) as
 select bk.business_id,bk.staff_id,bk.starts_at,bk.ends_at,bk.gap_min,bk.active_after_min
 from bookings bk join businesses b on b.id=bk.business_id where bk.status<>'cancelled' and b.deletion_requested_at is null
 union all
 select h.business_id,h.staff_id,h.starts_at,h.ends_at,h.gap_min,h.active_after_min
 from booking_checkout_holds h join businesses b on b.id=h.business_id
 where h.expires_at>now() and h.fulfilled_booking_id is null and b.deletion_requested_at is null;
grant select on public.public_booking_slots to anon,authenticated;

-- Wrap the existing segment-aware checker so every caller observes holds.
alter function public.assert_no_booking_conflict(uuid,timestamptz,timestamptz,integer,integer,uuid)
 rename to assert_no_booking_conflict_without_holds;
revoke all on function public.assert_no_booking_conflict_without_holds(uuid,timestamptz,timestamptz,integer,integer,uuid) from public,anon,authenticated;
create function public.assert_no_booking_conflict(p_staff_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,
 p_gap_min integer,p_active_after_min integer,p_exclude_booking_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform assert_no_booking_conflict_without_holds(p_staff_id,p_starts_at,p_ends_at,p_gap_min,p_active_after_min,p_exclude_booking_id);
 if exists(
  with segments as(
   select p_starts_at as starts,case when p_gap_min is null then p_ends_at else p_ends_at-make_interval(mins=>p_gap_min+p_active_after_min) end as ends
   union all select p_ends_at-make_interval(mins=>p_active_after_min),p_ends_at where p_gap_min is not null
  ), held as(
   select h.* from booking_checkout_holds h where h.staff_id=p_staff_id and h.expires_at>now() and h.fulfilled_booking_id is null
    and h.id::text is distinct from nullif(current_setting('bookzenvo.checkout_hold',true),'')
  ), held_segments as(
   select starts_at as starts,case when gap_min is null then ends_at else ends_at-make_interval(mins=>gap_min+active_after_min) end as ends from held
   union all select ends_at-make_interval(mins=>active_after_min),ends_at from held where gap_min is not null
  ) select 1 from segments s join held_segments h on h.starts<s.ends and h.ends>s.starts
 ) then raise exception 'SLOT_TAKEN';end if;
end;$$;
revoke all on function public.assert_no_booking_conflict(uuid,timestamptz,timestamptz,integer,integer,uuid) from public;
grant execute on function public.assert_no_booking_conflict(uuid,timestamptz,timestamptz,integer,integer,uuid) to anon,authenticated,service_role;

create function public.reserve_booking_checkout(p_business_id uuid,p_service_id uuid,p_staff_id uuid,p_starts_at timestamptz,p_request_key text,p_contact_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare h booking_checkout_holds%rowtype;b businesses%rowtype;s services%rowtype;finish timestamptz;amount integer;
begin
 perform pg_advisory_xact_lock(hashtext('checkout:'||p_business_id::text));
 perform pg_advisory_xact_lock(hashtext(p_staff_id::text));
 select * into h from booking_checkout_holds where business_id=p_business_id and request_key=p_request_key and expires_at>now() and fulfilled_booking_id is null order by created_at desc limit 1;
 if found then return to_jsonb(h);end if;
 if p_request_key !~ '^[a-f0-9]{64}$' or p_contact_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid checkout identity';end if;
 if (select count(*) from booking_checkout_holds where business_id=p_business_id and created_at>now()-interval '1 minute')>=30
    or (select count(*) from booking_checkout_holds where business_id=p_business_id and contact_key=p_contact_key and created_at>now()-interval '15 minutes')>=3 then
   raise exception 'Too many checkout attempts. Please try again later';end if;
 finish:=validate_public_booking_slot(p_business_id,p_service_id,p_staff_id,p_starts_at);
 select * into b from businesses where id=p_business_id;
 select * into s from services where id=p_service_id;
 if b.payment_mode not in('full','deposit') or not coalesce(b.stripe_charges_enabled,false) or b.stripe_account_id is null then raise exception 'Online payment is unavailable';end if;
 amount:=case when b.payment_mode='full' then s.price_cents else round(s.price_cents*b.deposit_percent/100.0) end;
 if amount<50 then raise exception 'This amount is too small for online payment';end if;
 insert into booking_checkout_holds(business_id,service_id,staff_id,request_key,contact_key,starts_at,ends_at,gap_min,active_after_min,price_cents,amount_cents,currency,payment_mode)
 values(b.id,s.id,p_staff_id,p_request_key,p_contact_key,p_starts_at,finish,s.gap_min,s.active_after_min,s.price_cents,amount,lower(b.currency),b.payment_mode) returning * into h;
 return to_jsonb(h);
end;$$;
revoke all on function public.reserve_booking_checkout(uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.reserve_booking_checkout(uuid,uuid,uuid,timestamptz,text,text) to service_role;

-- Raw staff inserts/updates must use the same lock and tenant references.
create function public.guard_booking_integrity() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and row(new.business_id,new.staff_id,new.service_id,new.customer_id,new.starts_at,new.ends_at,new.status,new.gap_min,new.active_after_min)
   is not distinct from row(old.business_id,old.staff_id,old.service_id,old.customer_id,old.starts_at,old.ends_at,old.status,old.gap_min,old.active_after_min) then return new;end if;
 if not exists(select 1 from staff where id=new.staff_id and business_id=new.business_id)
   or(new.service_id is not null and not exists(select 1 from services where id=new.service_id and business_id=new.business_id))
   or(new.customer_id is not null and not exists(select 1 from customers where id=new.customer_id and business_id=new.business_id)) then raise exception 'Booking references must belong to the same workspace';end if;
 if new.starts_at is null or new.ends_at is null or not isfinite(new.starts_at) or not isfinite(new.ends_at) or new.ends_at<=new.starts_at then raise exception 'Invalid appointment duration';end if;
 if new.status<>'cancelled' and (tg_op='INSERT' or old.status='cancelled' or
   row(new.staff_id,new.starts_at,new.ends_at,new.gap_min,new.active_after_min) is distinct from row(old.staff_id,old.starts_at,old.ends_at,old.gap_min,old.active_after_min))
 then perform assert_no_booking_conflict(new.staff_id,new.starts_at,new.ends_at,new.gap_min,new.active_after_min,new.id);end if;
 return new;
end;$$;
revoke all on function public.guard_booking_integrity() from public,anon,authenticated;
create trigger guard_booking_integrity before insert or update on bookings for each row execute function public.guard_booking_integrity();

create function public.fulfill_held_booking(p_hold_id uuid,p_amount_cents integer,p_currency text,p_payment_intent_id text,
 p_customer_name text,p_customer_email text,p_customer_phone text,p_notes text,p_stripe_customer_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare h booking_checkout_holds%rowtype;booking_id uuid;customer_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('payment:'||p_payment_intent_id));
 if exists(select 1 from booking_payment_issues where payment_intent_id=p_payment_intent_id and status in('refund_pending','refunded')) then raise exception 'This payment is being refunded';end if;
 select * into h from booking_checkout_holds where id=p_hold_id for update;
 if not found then raise exception 'Checkout reservation not found';end if;
 if h.fulfilled_booking_id is not null then
   if not exists(select 1 from bookings where id=h.fulfilled_booking_id and stripe_payment_intent_id=p_payment_intent_id) then raise exception 'Reservation payment mismatch';end if;
   return h.fulfilled_booking_id;
 end if;
 if p_payment_intent_id is null or p_amount_cents is distinct from h.amount_cents or lower(p_currency) is distinct from h.currency then raise exception 'Reservation payment mismatch';end if;
 if exists(select 1 from businesses where id=h.business_id and deletion_requested_at is not null) then raise exception 'The business is closed';end if;
 perform set_config('bookzenvo.checkout_hold',h.id::text,true);
 perform assert_no_booking_conflict(h.staff_id,h.starts_at,h.ends_at,h.gap_min,h.active_after_min);
 select c.id into customer_id from customers c where c.business_id=h.business_id and lower(c.email)=lower(trim(p_customer_email)) limit 1;
 if customer_id is null and nullif(trim(p_customer_phone),'') is not null then
   select c.id into customer_id from customers c where c.business_id=h.business_id and c.phone=trim(p_customer_phone) limit 1;
 end if;
 if customer_id is null then
   insert into customers(business_id,name,email,phone,stripe_customer_id)
   values(h.business_id,p_customer_name,nullif(trim(p_customer_email),''),nullif(trim(p_customer_phone),''),nullif(p_stripe_customer_id,'')) returning id into customer_id;
 end if;
 insert into bookings(business_id,service_id,staff_id,customer_id,customer_name,customer_email,customer_phone,starts_at,ends_at,
  price_cents,notes,payment_status,amount_due_cents,amount_paid_cents,stripe_payment_intent_id,gap_min,active_after_min)
 values(h.business_id,h.service_id,h.staff_id,customer_id,p_customer_name,nullif(trim(p_customer_email),''),nullif(trim(p_customer_phone),''),
  h.starts_at,h.ends_at,h.price_cents,nullif(trim(p_notes),''),case when h.payment_mode='full' then 'paid' else 'deposit_paid' end,
  greatest(h.price_cents-h.amount_cents,0),h.amount_cents,p_payment_intent_id,h.gap_min,h.active_after_min) returning id into booking_id;
 insert into payments(business_id,booking_id,stripe_payment_intent_id,type,status,amount_cents,currency,customer_name,customer_email,description)
 values(h.business_id,booking_id,p_payment_intent_id,'charge','succeeded',h.amount_cents,h.currency,p_customer_name,
  nullif(trim(p_customer_email),''),case when h.payment_mode='full' then 'Full payment' else 'Deposit' end);
 update booking_checkout_holds set fulfilled_booking_id=booking_id where id=h.id;
 perform set_config('bookzenvo.checkout_hold','',true);
 return booking_id;
end;$$;
revoke all on function public.fulfill_held_booking(uuid,integer,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_held_booking(uuid,integer,text,text,text,text,text,text,text) to service_role;

create table public.booking_payment_issues(
 payment_intent_id text primary key,business_id uuid not null references businesses(id),stripe_account_id text not null,
 hold_id uuid references booking_checkout_holds(id),reason text not null,status text not null default 'open' check(status in('open','resolved','refund_pending','refunded')),
 created_at timestamptz not null default now(),resolved_at timestamptz,refund_id text
);
alter table public.booking_payment_issues enable row level security;
revoke all on booking_payment_issues from public,anon,authenticated;
grant all on booking_payment_issues to service_role;
create function public.claim_booking_payment_refund(p_payment_intent_id text) returns jsonb language plpgsql security definer set search_path=public as $$
declare issue booking_payment_issues%rowtype;
begin
 perform pg_advisory_xact_lock(hashtext('payment:'||p_payment_intent_id));
 select * into issue from booking_payment_issues where payment_intent_id=p_payment_intent_id for update;
 if not found or issue.status not in('open','refund_pending') or issue.hold_id is null or issue.created_at>now()-interval '15 minutes' then return null;end if;
 if exists(select 1 from bookings where stripe_payment_intent_id=p_payment_intent_id) then
  update booking_payment_issues set status='resolved',resolved_at=now() where payment_intent_id=p_payment_intent_id;return null;
 end if;
 update booking_payment_issues set status='refund_pending' where payment_intent_id=p_payment_intent_id;
 return to_jsonb(issue);
end;$$;
revoke all on function public.claim_booking_payment_refund(text) from public,anon,authenticated;
grant execute on function public.claim_booking_payment_refund(text) to service_role;
notify pgrst,'reload schema';
