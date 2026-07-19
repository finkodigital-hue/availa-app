-- Rate-limit anonymous public bookings to blunt scripted/spam abuse of
-- create_public_booking (the anon-callable RPC the public /book/$slug page
-- uses). Two independent limits, both scoped to the target business so one
-- business's traffic can't affect another's:
--
--   1. Per-contact: the same email or phone submitting more than 5 bookings
--      to this business in a 15-minute window is blocked. Catches a single
--      abuser hammering one business.
--   2. Business-wide burst: more than 30 bookings created for this business
--      in the last 60 seconds is blocked. Catches a scripted flood that
--      rotates fake contact details.
--
-- Both raise a distinct 'RATE_LIMITED' exception so the client can show a
-- friendly "please try again in a bit" message instead of a generic error.
-- Real bookings from the authenticated dashboard (new-booking-dialog.tsx)
-- go through a different insert path and are unaffected.

CREATE INDEX IF NOT EXISTS bookings_business_created_idx
  ON public.bookings (business_id, created_at DESC);

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
  v_contact_count integer;
  v_burst_count integer;
BEGIN
  -- Burst limit: too many bookings landing on this business in the last minute.
  SELECT count(*) INTO v_burst_count
  FROM bookings
  WHERE business_id = p_business_id
    AND created_at > now() - interval '60 seconds';

  IF v_burst_count >= 30 THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many booking requests right now, please try again in a minute';
  END IF;

  -- Per-contact limit: same email/phone booking repeatedly in a short window.
  IF (p_customer_email IS NOT NULL AND length(trim(p_customer_email)) > 0)
     OR (p_customer_phone IS NOT NULL AND length(trim(p_customer_phone)) > 0) THEN
    SELECT count(*) INTO v_contact_count
    FROM bookings
    WHERE business_id = p_business_id
      AND created_at > now() - interval '15 minutes'
      AND (
        (p_customer_email IS NOT NULL AND length(trim(p_customer_email)) > 0
          AND lower(customer_email) = lower(trim(p_customer_email)))
        OR
        (p_customer_phone IS NOT NULL AND length(trim(p_customer_phone)) > 0
          AND customer_phone = trim(p_customer_phone))
      );

    IF v_contact_count >= 5 THEN
      RAISE EXCEPTION 'RATE_LIMITED: too many booking attempts, please try again later';
    END IF;
  END IF;

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
