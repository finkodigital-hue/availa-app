-- One immutable, private Checkout attempt per outstanding booking balance.
create table public.balance_checkout_attempts (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 business_id uuid not null references public.businesses(id) on delete cascade,
 amount_cents integer not null check(amount_cents>=50),
 currency text not null,
 stripe_account_id text not null,
 customer_email text,
 return_origin text not null,
 business_slug text not null,
 created_at timestamptz not null default now(),
 session_id text unique,
 payment_intent_id text,
 state text not null default 'active' check(state in('active','expired','complete','review')),
 last_error text
);
create unique index balance_checkout_one_active on public.balance_checkout_attempts(booking_id) where state in('active','review');
alter table public.balance_checkout_attempts enable row level security;
revoke all on public.balance_checkout_attempts from public,anon,authenticated;
grant all on public.balance_checkout_attempts to service_role;

create function public.claim_balance_checkout(p_business_id uuid,p_booking_id uuid,p_origin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b businesses%rowtype; bk bookings%rowtype; a balance_checkout_attempts%rowtype; remaining integer;
begin
 perform pg_advisory_xact_lock(hashtext('balance:'||p_booking_id::text));
 select * into b from businesses where id=p_business_id and deletion_requested_at is null;
 if not found or b.stripe_account_id is null or not b.stripe_charges_enabled then raise exception 'Online payment is unavailable';end if;
 select * into bk from bookings where id=p_booking_id and business_id=p_business_id for update;
 if not found then raise exception 'Booking not found';end if;
 if bk.status='cancelled' or bk.amount_refunded_cents>0 or bk.payment_status in('refunded','partially_refunded') then raise exception 'This booking needs payment review before another charge';end if;
 remaining:=bk.price_cents-bk.amount_paid_cents;
 if remaining is null or remaining<50 then raise exception 'There is no remaining balance to collect';end if;
 if exists(select 1 from payments where booking_id=bk.id and type='charge' and status='succeeded' and lower(currency)<>lower(b.currency)) then
  raise exception 'Booking currency has changed; payment review is required';
 end if;
 select * into a from balance_checkout_attempts where booking_id=bk.id and state in('active','review');
 if found then
  if a.amount_cents<>remaining or a.currency<>lower(b.currency) or a.stripe_account_id<>b.stripe_account_id then
   raise exception 'The previous checkout must be reviewed before the balance can change';
  end if;
  return to_jsonb(a);
 end if;
 insert into balance_checkout_attempts(booking_id,business_id,amount_cents,currency,stripe_account_id,customer_email,return_origin,business_slug)
 values(bk.id,b.id,remaining,lower(b.currency),b.stripe_account_id,bk.customer_email,p_origin,b.slug) returning * into a;
 return to_jsonb(a);
end;$$;

create function public.record_balance_checkout_session(p_attempt_id uuid,p_session_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
 update balance_checkout_attempts set session_id=p_session_id where id=p_attempt_id and (session_id is null or session_id=p_session_id);
 if not found then raise exception 'Checkout session mismatch';end if;
end;$$;

-- Called only after the server retrieves an expired, unpaid Stripe session.
create function public.expire_balance_checkout(p_attempt_id uuid,p_session_id text)
returns void language plpgsql security definer set search_path=public as $$
declare booking uuid;
begin
 select booking_id into booking from balance_checkout_attempts where id=p_attempt_id;
 perform pg_advisory_xact_lock(hashtext('balance:'||booking::text));
 update balance_checkout_attempts set state='expired' where id=p_attempt_id and session_id=p_session_id and state='active';
 if not found then raise exception 'Checkout can no longer be replaced';end if;
end;$$;

create or replace function public.fulfill_stripe_balance_payment(
 p_booking_id uuid,p_business_id uuid,p_amount_cents integer,p_currency text,p_stripe_payment_intent_id text,p_stripe_charge_id text
) returns uuid language plpgsql security definer set search_path=public as $$
declare bk bookings%rowtype; previous payments%rowtype; expected_currency text;
begin
 if p_amount_cents is null or p_amount_cents<=0 or nullif(p_stripe_payment_intent_id,'') is null or p_currency is null then raise exception 'Invalid balance payment';end if;
 perform pg_advisory_xact_lock(hashtext('balance:'||p_booking_id::text));
 perform pg_advisory_xact_lock(hashtext('payment:'||p_stripe_payment_intent_id));
 select * into previous from payments where stripe_payment_intent_id=p_stripe_payment_intent_id and type='charge';
 if found then
  if previous.booking_id is distinct from p_booking_id or previous.business_id is distinct from p_business_id
    or previous.amount_cents is distinct from p_amount_cents or lower(previous.currency) is distinct from lower(p_currency) or previous.status<>'succeeded' then
   raise exception 'Balance payment identity mismatch';
  end if;
  return p_booking_id;
 end if;
 select * into bk from bookings where id=p_booking_id and business_id=p_business_id for update;
 if not found then raise exception 'Booking not found for balance payment';end if;
 select lower(currency) into expected_currency from businesses where id=p_business_id;
 if lower(p_currency) is distinct from expected_currency then raise exception 'Unexpected balance payment currency';end if;
 if bk.status='cancelled' or bk.amount_refunded_cents>0 then raise exception 'This booking requires payment review';end if;
 if p_amount_cents is distinct from greatest(bk.price_cents-bk.amount_paid_cents,0) then raise exception 'Unexpected Stripe balance payment amount';end if;
 update bookings set amount_paid_cents=price_cents,amount_due_cents=0,payment_status='paid' where id=p_booking_id;
 insert into payments(business_id,booking_id,stripe_payment_intent_id,stripe_charge_id,type,status,amount_cents,currency,customer_name,customer_email,description)
 values(p_business_id,p_booking_id,p_stripe_payment_intent_id,p_stripe_charge_id,'charge','succeeded',p_amount_cents,lower(p_currency),bk.customer_name,bk.customer_email,'Remaining balance');
 return p_booking_id;
end;$$;

create function public.fulfill_balance_checkout(p_attempt_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer,p_currency text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a balance_checkout_attempts%rowtype; result uuid;
begin
 select * into a from balance_checkout_attempts where id=p_attempt_id;
 if not found then raise exception 'Balance checkout not found';end if;
 perform pg_advisory_xact_lock(hashtext('balance:'||a.booking_id::text));
 select * into a from balance_checkout_attempts where id=p_attempt_id for update;
 if a.amount_cents is distinct from p_amount_cents or a.currency is distinct from lower(p_currency)
   or (a.session_id is not null and a.session_id is distinct from p_session_id)
   or (a.payment_intent_id is not null and a.payment_intent_id is distinct from p_payment_intent_id)
   or nullif(p_session_id,'') is null or a.state='expired' then raise exception 'Balance checkout payment mismatch';end if;
 result:=fulfill_stripe_balance_payment(a.booking_id,a.business_id,p_amount_cents,p_currency,p_payment_intent_id,null);
 update balance_checkout_attempts set session_id=p_session_id,payment_intent_id=p_payment_intent_id,state='complete',last_error=null where id=a.id;
 return result;
end;$$;

revoke all on function public.claim_balance_checkout(uuid,uuid,text),public.record_balance_checkout_session(uuid,text),public.expire_balance_checkout(uuid,text),public.fulfill_balance_checkout(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_balance_checkout(uuid,uuid,text),public.record_balance_checkout_session(uuid,text),public.expire_balance_checkout(uuid,text),public.fulfill_balance_checkout(uuid,text,text,integer,text) to service_role;
revoke all on function public.fulfill_stripe_balance_payment(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_stripe_balance_payment(uuid,uuid,integer,text,text,text) to service_role;
notify pgrst,'reload schema';
