
-- The real, complete fix for the anonymous-booking breakage chain.
--
-- `customers` was created with INSERT granted to `authenticated` only.
-- Migration 20260704165430 added an anon INSERT policy ("public can insert
-- customers for booking") but never granted the underlying table privilege
-- — a policy only restricts rows for an operation a role can already
-- perform; it's not a substitute for GRANT. Confirmed by reproducing the
-- identical error against a table anon has zero grants on at all
-- (rent_payments) — Postgres/PostgREST report missing-grant and failed-
-- WITH-CHECK with the exact same "new row violates row-level security
-- policy" wording, which is what made this hard to isolate from the
-- previous two fixes.
--
-- Simply granting INSERT isn't enough either: the function also does an
-- internal SELECT against `customers` first (to dedupe by email/phone
-- before inserting), and anon was never meant to have direct read access
-- to customer records at all ("no read exposure", per that migration's own
-- comment) — so a plain SELECT grant would contradict the original intent.
--
-- The actual design this function was built for: run as SECURITY DEFINER
-- so its *own* explicit checks (service belongs to this business and is
-- active; staff belongs to this business; slot not already taken) are the
-- safety boundary, not RLS on the caller's role — letting it do the
-- necessary internal customer lookup/insert without exposing that read
-- path to anon directly. Migration 20260704165430 downgraded it to
-- SECURITY INVOKER as part of a blanket "harden SECURITY DEFINER
-- functions" pass, without accounting for this function's internal need
-- for elevated privilege. That one line is what actually broke every
-- anonymous booking (the staff/businesses gaps fixed in the previous two
-- migrations were symptoms of the same root cause, surfacing one at a
-- time as each successive internal check was reached).
CREATE OR REPLACE FUNCTION public.create_public_booking(p_business_id uuid, p_service_id uuid, p_staff_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price_cents integer;
  v_customer_id uuid;
  v_booking_id  uuid;
BEGIN
  SELECT price_cents INTO v_price_cents
  FROM services
  WHERE id = p_service_id AND business_id = p_business_id AND active = true;

  IF v_price_cents IS NULL THEN
    RAISE EXCEPTION 'Invalid service for this business';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'Invalid staff for this business';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_staff_id::text));

  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE staff_id = p_staff_id
      AND status <> 'cancelled'
      AND starts_at < p_ends_at
      AND ends_at > p_starts_at
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;

  IF p_customer_email IS NOT NULL AND length(trim(p_customer_email)) > 0 THEN
    SELECT id INTO v_customer_id FROM customers
    WHERE business_id = p_business_id AND lower(email) = lower(trim(p_customer_email)) LIMIT 1;
  END IF;

  IF v_customer_id IS NULL AND p_customer_phone IS NOT NULL AND length(trim(p_customer_phone)) > 0 THEN
    SELECT id INTO v_customer_id FROM customers
    WHERE business_id = p_business_id AND phone = trim(p_customer_phone) LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (business_id, name, email, phone)
    VALUES (p_business_id, p_customer_name,
            NULLIF(trim(p_customer_email), ''), NULLIF(trim(p_customer_phone), ''))
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO bookings (
    business_id, service_id, staff_id, customer_id,
    customer_name, customer_email, customer_phone,
    starts_at, ends_at, price_cents, notes
  )
  VALUES (
    p_business_id, p_service_id, p_staff_id, v_customer_id,
    p_customer_name, NULLIF(trim(p_customer_email), ''), NULLIF(trim(p_customer_phone), ''),
    p_starts_at, p_ends_at, v_price_cents, NULLIF(trim(p_notes), '')
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$function$;
