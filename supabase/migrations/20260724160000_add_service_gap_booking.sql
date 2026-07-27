-- Gap / processing-time booking: a service can have a "dead" middle segment
-- (e.g. colour developing) where the client is away but the chair is free and
-- genuinely bookable by a different client, then the original client returns
-- for the final segment.
--
-- duration_minutes keeps its exact current meaning when gap_min/active_after_min
-- are null (the ~100% of services with no gap): it's the whole service, and
-- every existing read path is unaffected. When a gap is configured,
-- duration_minutes becomes "the first active segment"; gap_min is the dead
-- middle; active_after_min is the second active segment.

alter table public.services
  add column gap_min integer,
  add column active_after_min integer;

alter table public.services
  add constraint services_gap_consistency_check check (
    (gap_min is null and active_after_min is null)
    or (gap_min > 0 and active_after_min > 0)
  );

-- Bookings snapshot gap_min/active_after_min at creation time, mirroring how
-- price_cents already snapshots services.price_cents rather than living off a
-- join — so editing a service's gap config later can't retroactively change
-- the busy/free windows of past bookings. ends_at keeps meaning "true end of
-- the whole appointment" (unchanged for reports/exports/calendar duration).
alter table public.bookings
  add column gap_min integer,
  add column active_after_min integer;

alter table public.bookings
  add constraint bookings_gap_consistency_check check (
    (gap_min is null and active_after_min is null)
    or (gap_min > 0 and active_after_min > 0)
  );

-- public_booking_slots (20260707140000) is the only view of bookings anon
-- can see, used by the public booking page's own client-side clash pre-check
-- (a courtesy check before redirecting to Stripe checkout / calling the RPC —
-- the RPC's assert_no_booking_conflict call is what actually enforces this).
-- Widen it to carry gap_min/active_after_min too, so that pre-check can do
-- the same segment-aware overlap test instead of treating a gap booking's
-- whole span as busy, which would wrongly report every gap as already taken.
CREATE OR REPLACE VIEW public.public_booking_slots
WITH (security_invoker = off) AS
SELECT business_id, staff_id, starts_at, ends_at, gap_min, active_after_min
  FROM public.bookings
 WHERE status <> 'cancelled';

-- Shared, race-safe, segment-aware conflict check. Every write path that
-- creates or moves a booking calls this instead of rolling its own overlap
-- query, so there is one source of truth for "does this overlap" instead of
-- three inconsistent ones (public RPC, staff-side raw insert, reschedule).
--
-- SECURITY DEFINER: the public booking path calls this as anon, which has no
-- SELECT policy on bookings at all (see 20260707140000's public_booking_slots
-- view) — this function must see every relevant booking regardless of caller.
--
-- Takes pg_advisory_xact_lock before checking and holds it for the rest of the
-- calling transaction (xact-scoped), so the check-then-write in every caller
-- is atomic against concurrent attempts for the same staff member — the same
-- guarantee create_public_booking already had, now shared by all three paths.
create or replace function public.assert_no_booking_conflict(
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_gap_min integer,
  p_active_after_min integer,
  p_exclude_booking_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflicts int;
begin
  perform pg_advisory_xact_lock(hashtext(p_staff_id::text));

  with new_segments as (
    select p_starts_at as seg_start,
           case when p_gap_min is null then p_ends_at
                else p_ends_at - make_interval(mins => p_gap_min) - make_interval(mins => p_active_after_min)
           end as seg_end
    union all
    select p_ends_at - make_interval(mins => p_active_after_min), p_ends_at
    where p_gap_min is not null
  ),
  existing_segments as (
    select b.starts_at as seg_start,
           case when b.gap_min is null then b.ends_at
                else b.ends_at - make_interval(mins => b.gap_min) - make_interval(mins => b.active_after_min)
           end as seg_end
    from public.bookings b
    where b.staff_id = p_staff_id
      and b.status <> 'cancelled'
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
    union all
    select b.ends_at - make_interval(mins => b.active_after_min), b.ends_at
    from public.bookings b
    where b.staff_id = p_staff_id
      and b.status <> 'cancelled'
      and b.gap_min is not null
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
  )
  select count(*) into v_conflicts
  from new_segments n join existing_segments e
    on e.seg_start < n.seg_end and e.seg_end > n.seg_start;

  if v_conflicts > 0 then
    raise exception 'SLOT_TAKEN';
  end if;
end;
$$;

-- create_public_booking: add gap params, delegate the conflict check to the
-- shared function instead of its old inline EXISTS query.
--
-- CREATE OR REPLACE FUNCTION only replaces a function whose parameter TYPE
-- LIST matches exactly. The two new trailing parameters change that list, so
-- without this explicit drop, Postgres would create a second, overloaded
-- create_public_booking rather than replace the original — leaving the old
-- 9-parameter version (with the old, un-gap-aware inline conflict check)
-- still live and callable.
drop function if exists public.create_public_booking(uuid, uuid, uuid, text, text, text, timestamp with time zone, timestamp with time zone, text);

create or replace function public.create_public_booking(p_business_id uuid, p_service_id uuid, p_staff_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text, p_gap_min integer default null, p_active_after_min integer default null)
 returns uuid
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  v_price_cents integer;
  v_customer_id uuid;
  v_booking_id  uuid;
begin
  select price_cents into v_price_cents
  from services
  where id = p_service_id and business_id = p_business_id and active = true;

  if v_price_cents is null then
    raise exception 'Invalid service for this business';
  end if;

  if not exists (select 1 from staff where id = p_staff_id and business_id = p_business_id) then
    raise exception 'Invalid staff for this business';
  end if;

  perform public.assert_no_booking_conflict(p_staff_id, p_starts_at, p_ends_at, p_gap_min, p_active_after_min);

  if p_customer_email is not null and length(trim(p_customer_email)) > 0 then
    select id into v_customer_id from customers
    where business_id = p_business_id and lower(email) = lower(trim(p_customer_email)) limit 1;
  end if;

  if v_customer_id is null and p_customer_phone is not null and length(trim(p_customer_phone)) > 0 then
    select id into v_customer_id from customers
    where business_id = p_business_id and phone = trim(p_customer_phone) limit 1;
  end if;

  if v_customer_id is null then
    insert into customers (business_id, name, email, phone)
    values (p_business_id, p_customer_name,
            nullif(trim(p_customer_email), ''), nullif(trim(p_customer_phone), ''))
    returning id into v_customer_id;
  end if;

  insert into bookings (
    business_id, service_id, staff_id, customer_id,
    customer_name, customer_email, customer_phone,
    starts_at, ends_at, price_cents, notes, gap_min, active_after_min
  )
  values (
    p_business_id, p_service_id, p_staff_id, v_customer_id,
    p_customer_name, nullif(trim(p_customer_email), ''), nullif(trim(p_customer_phone), ''),
    p_starts_at, p_ends_at, v_price_cents, nullif(trim(p_notes), ''), p_gap_min, p_active_after_min
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$function$;

-- create_staff_booking: mirrors today's client-side insert() in
-- new-booking-dialog.tsx exactly (same fields, same nullable service/custom
-- support, same cross-business target for independent pros) — the
-- customer-lookup/walk-in/cross-business logic stays in TS where it already
-- works correctly. This only makes the actual write atomic: lock -> check ->
-- insert, closing the gap where staff-side booking had no server-side
-- conflict check at all.
--
-- SECURITY INVOKER: existing RLS policies (owner manages bookings / salon
-- inserts pro bookings) keep governing who is allowed to write what — this
-- adds the missing conflict check on top, it does not change authorization.
create or replace function public.create_staff_booking(
  p_business_id uuid, p_service_id uuid, p_staff_id uuid, p_customer_id uuid,
  p_customer_name text, p_customer_email text, p_customer_phone text,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_price_cents integer, p_amount_paid_cents integer, p_amount_due_cents integer,
  p_notes text, p_source text, p_notify_customer boolean,
  p_is_custom boolean, p_custom_title text, p_custom_color text,
  p_status text, p_gap_min integer default null, p_active_after_min integer default null,
  p_payment_status text default 'unpaid'
) returns uuid
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_booking_id uuid;
begin
  perform public.assert_no_booking_conflict(p_staff_id, p_starts_at, p_ends_at, p_gap_min, p_active_after_min);

  insert into bookings (
    business_id, service_id, staff_id, customer_id,
    customer_name, customer_email, customer_phone,
    starts_at, ends_at, price_cents, amount_paid_cents, amount_due_cents,
    notes, source, notify_customer, is_custom, custom_title, custom_color, status,
    gap_min, active_after_min, payment_status
  )
  values (
    p_business_id, p_service_id, p_staff_id, p_customer_id,
    p_customer_name, p_customer_email, p_customer_phone,
    p_starts_at, p_ends_at, p_price_cents, p_amount_paid_cents, p_amount_due_cents,
    p_notes, p_source, p_notify_customer, p_is_custom, p_custom_title, p_custom_color, p_status,
    p_gap_min, p_active_after_min, p_payment_status
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$function$;

-- reschedule_booking: replaces the separate check-then-update in
-- reschedule-commit.ts (which has a race window between the two queries)
-- with one atomic lock -> check -> update. Total duration is preserved from
-- the existing row so gap-bookings keep their before/gap/after proportions
-- regardless of any later change to the service's own configuration.
create or replace function public.reschedule_booking(
  p_booking_id uuid, p_new_starts_at timestamptz
) returns void
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_staff_id uuid;
  v_duration interval;
  v_gap_min integer;
  v_active_after_min integer;
  v_new_ends_at timestamptz;
begin
  select staff_id, ends_at - starts_at, gap_min, active_after_min
    into v_staff_id, v_duration, v_gap_min, v_active_after_min
  from bookings where id = p_booking_id;

  if v_staff_id is null then
    raise exception 'Booking not found';
  end if;

  v_new_ends_at := p_new_starts_at + v_duration;

  perform public.assert_no_booking_conflict(
    v_staff_id, p_new_starts_at, v_new_ends_at, v_gap_min, v_active_after_min, p_booking_id
  );

  update bookings set starts_at = p_new_starts_at, ends_at = v_new_ends_at where id = p_booking_id;
end;
$function$;

grant execute on function public.create_public_booking(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, text, integer, integer) to anon, authenticated;
grant execute on function public.create_staff_booking(uuid, uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer, integer, text, text, boolean, boolean, text, text, text, integer, integer, text) to authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;

-- fulfill_stripe_checkout: a fourth, previously-missed write path — the paid
-- online booking flow bypasses create_public_booking entirely (the client
-- redirects straight to Stripe Checkout) and only creates the booking once
-- the webhook fires, via this function. It had its own inline raw-span
-- conflict check (the exact pattern being consolidated everywhere else) and
-- never stored gap_min/active_after_min, which would have both blocked paid
-- customers from booking into a gap and silently turned a paid gap-booking
-- into an un-gapped, fully-blocking one. Add the two params, delegate to the
-- shared conflict check, and persist them on the inserted row.
drop function if exists public.fulfill_stripe_checkout(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, text, text, integer, text, text, text, text);

create or replace function public.fulfill_stripe_checkout(
  p_business_id uuid, p_service_id uuid, p_staff_id uuid, p_customer_name text,
  p_customer_email text, p_customer_phone text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_notes text, p_payment_mode text, p_amount_cents integer,
  p_currency text, p_stripe_payment_intent_id text, p_stripe_charge_id text,
  p_stripe_customer_id text, p_gap_min integer default null, p_active_after_min integer default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_booking_id uuid; v_customer_id uuid; v_price_cents integer;
  v_deposit_percent integer; v_expected_amount integer;
begin
  select id into v_booking_id from bookings where stripe_payment_intent_id = p_stripe_payment_intent_id;
  if v_booking_id is not null then return v_booking_id; end if;

  select s.price_cents, b.deposit_percent into v_price_cents, v_deposit_percent
  from services s join businesses b on b.id = s.business_id
  where s.id = p_service_id and s.business_id = p_business_id and s.active = true;
  if v_price_cents is null then raise exception 'Invalid service for Stripe checkout'; end if;
  if not exists (select 1 from staff where id = p_staff_id and business_id = p_business_id) then
    raise exception 'Invalid staff member for Stripe checkout';
  end if;
  if p_payment_mode = 'full' then v_expected_amount := v_price_cents;
  elsif p_payment_mode = 'deposit' then v_expected_amount := round(v_price_cents * v_deposit_percent / 100.0);
  else raise exception 'Invalid online payment mode'; end if;
  if p_amount_cents <> v_expected_amount then raise exception 'Unexpected Stripe payment amount'; end if;

  perform public.assert_no_booking_conflict(p_staff_id, p_starts_at, p_ends_at, p_gap_min, p_active_after_min);

  select id into v_customer_id from customers
  where business_id = p_business_id and lower(email) = lower(trim(p_customer_email))
  limit 1;
  if v_customer_id is null and length(trim(p_customer_phone)) > 0 then
    select id into v_customer_id from customers
    where business_id = p_business_id and phone = trim(p_customer_phone)
    limit 1;
  end if;
  if v_customer_id is null then
    insert into customers (business_id, name, email, phone, stripe_customer_id)
    values (p_business_id, p_customer_name, nullif(trim(p_customer_email), ''), nullif(trim(p_customer_phone), ''), nullif(trim(p_stripe_customer_id), ''))
    returning id into v_customer_id;
  elsif nullif(trim(p_stripe_customer_id), '') is not null then
    update customers set stripe_customer_id = p_stripe_customer_id where id = v_customer_id;
  end if;

  insert into bookings (business_id, service_id, staff_id, customer_id, customer_name,
    customer_email, customer_phone, starts_at, ends_at, price_cents, notes, payment_status,
    amount_due_cents, amount_paid_cents, stripe_payment_intent_id, stripe_charge_id,
    gap_min, active_after_min)
  values (p_business_id, p_service_id, p_staff_id, v_customer_id, p_customer_name,
    nullif(trim(p_customer_email), ''), nullif(trim(p_customer_phone), ''), p_starts_at,
    p_ends_at, v_price_cents, nullif(trim(p_notes), ''),
    case when p_payment_mode = 'full' then 'paid' else 'deposit_paid' end,
    greatest(v_price_cents - p_amount_cents, 0), p_amount_cents,
    p_stripe_payment_intent_id, p_stripe_charge_id, p_gap_min, p_active_after_min)
  returning id into v_booking_id;

  insert into payments (business_id, booking_id, stripe_payment_intent_id, stripe_charge_id,
    type, status, amount_cents, currency, customer_name, customer_email, description)
  values (p_business_id, v_booking_id, p_stripe_payment_intent_id, p_stripe_charge_id,
    'charge', 'succeeded', p_amount_cents, lower(p_currency), p_customer_name,
    nullif(trim(p_customer_email), ''), case when p_payment_mode = 'full' then 'Full payment' else 'Deposit' end);
  return v_booking_id;
end;
$$;

revoke all on function public.fulfill_stripe_checkout(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,integer,text,text,text,text,integer,integer) from public;
revoke all on function public.fulfill_stripe_checkout(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,integer,text,text,text,text,integer,integer) from anon, authenticated;
grant execute on function public.fulfill_stripe_checkout(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,integer,text,text,text,text,integer,integer) to service_role;

-- get_portal_bookings (20260716122000): the customer portal's "My bookings"
-- page reads its service info from this function's embedded services jsonb
-- blob, not a live join, so its own reschedule slot search needs gap_min /
-- active_after_min added here too. Same RETURNS TABLE shape, so this is a
-- safe in-place CREATE OR REPLACE — no signature change, no overload risk.
CREATE OR REPLACE FUNCTION public.get_portal_bookings()
RETURNS TABLE(
  id uuid,
  business_id uuid,
  service_id uuid,
  staff_id uuid,
  customer_email text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  price_cents int,
  notes text,
  businesses jsonb,
  services jsonb,
  staff jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.id, b.business_id, b.service_id, b.staff_id, b.customer_email,
    b.starts_at, b.ends_at, b.status, b.price_cents, b.notes,
    jsonb_build_object(
      'id', biz.id, 'name', biz.name, 'slug', biz.slug, 'address', biz.address,
      'page_theme', biz.page_theme, 'cancellation_window_hours', biz.cancellation_window_hours
    ),
    jsonb_build_object('id', sv.id, 'name', sv.name, 'duration_minutes', sv.duration_minutes, 'gap_min', sv.gap_min, 'active_after_min', sv.active_after_min),
    jsonb_build_object('id', st.id, 'name', st.name)
  FROM public.bookings b
  LEFT JOIN public.businesses biz ON biz.id = b.business_id
  LEFT JOIN public.services sv ON sv.id = b.service_id
  LEFT JOIN public.staff st ON st.id = b.staff_id
  WHERE lower(b.customer_email) = public.current_user_email()
  ORDER BY b.starts_at DESC
  LIMIT 200;
$$;
