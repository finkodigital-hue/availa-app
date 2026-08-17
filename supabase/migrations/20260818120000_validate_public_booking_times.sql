-- create_public_booking trusted two more pieces of anonymous input than it
-- should have: the start time (nothing rejected bookings in the past) and the
-- END time. assert_no_booking_conflict only guards against other bookings, so
-- a direct API call — the RPC is anon-callable by design — could submit e.g.
-- starts 09:00 / ends 21:00 and block a staff member's entire day with one
-- "booking", or create bookings at 3am or last week. The client UI computes
-- ends_at as starts + duration + gap + active_after and only offers valid
-- slots, but the server never checked any of it.
--
-- Same philosophy as 20260811120000 (which stopped trusting client gap
-- values): scheduling facts come from the service record, not the caller.
-- p_ends_at stays in the signature for client compatibility but is now
-- ignored; the server computes the end time itself.

CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_notes text,
  p_gap_min integer DEFAULT NULL,
  p_active_after_min integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_price_cents integer;
  v_duration_minutes integer;
  v_gap_min integer;
  v_active_after_min integer;
  v_ends_at timestamptz;
  v_customer_id uuid;
  v_booking_id uuid;
  v_contact_count integer;
  v_burst_count integer;
BEGIN
  -- Basic input sanity for the anonymous endpoint.
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  IF length(p_customer_name) > 200 OR length(coalesce(p_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'Input too long';
  END IF;

  -- No bookings in the past. A 5-minute grace window covers a customer who
  -- picked the current slot and dawdled on the details step.
  IF p_starts_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'SLOT_IN_PAST: that time has already passed, please pick another';
  END IF;

  -- And nothing absurdly far out (keeps the calendar honest and bounds abuse).
  IF p_starts_at > now() + interval '365 days' THEN
    RAISE EXCEPTION 'Bookings can only be made up to a year ahead';
  END IF;

  -- Business-wide burst protection for the anonymous endpoint.
  SELECT count(*) INTO v_burst_count
  FROM bookings
  WHERE business_id = p_business_id
    AND created_at > now() - interval '60 seconds';

  IF v_burst_count >= 30 THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many booking requests right now, please try again in a minute';
  END IF;

  -- Per-contact protection. Blank contact values are deliberately ignored.
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

  -- Scheduling rules come from the service record, not anonymous input.
  SELECT price_cents, duration_minutes, gap_min, active_after_min
  INTO v_price_cents, v_duration_minutes, v_gap_min, v_active_after_min
  FROM services
  WHERE id = p_service_id
    AND business_id = p_business_id
    AND active = true;

  IF v_price_cents IS NULL THEN
    RAISE EXCEPTION 'Invalid service for this business';
  END IF;

  -- The server, not the caller, decides when this booking ends: exactly the
  -- shape the client UI computes for its slot grid (duration + gap +
  -- active-after), so honest callers see identical behavior to before.
  v_ends_at := p_starts_at
    + make_interval(mins => v_duration_minutes + coalesce(v_gap_min, 0) + coalesce(v_active_after_min, 0));

  IF NOT EXISTS (
    SELECT 1
    FROM staff
    WHERE id = p_staff_id
      AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Invalid staff for this business';
  END IF;

  PERFORM public.assert_no_booking_conflict(
    p_staff_id,
    p_starts_at,
    v_ends_at,
    v_gap_min,
    v_active_after_min
  );

  IF p_customer_email IS NOT NULL AND length(trim(p_customer_email)) > 0 THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE business_id = p_business_id
      AND lower(email) = lower(trim(p_customer_email))
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL
     AND p_customer_phone IS NOT NULL
     AND length(trim(p_customer_phone)) > 0 THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE business_id = p_business_id
      AND phone = trim(p_customer_phone)
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (business_id, name, email, phone)
    VALUES (
      p_business_id,
      p_customer_name,
      NULLIF(trim(p_customer_email), ''),
      NULLIF(trim(p_customer_phone), '')
    )
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO bookings (
    business_id,
    service_id,
    staff_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    starts_at,
    ends_at,
    price_cents,
    notes,
    gap_min,
    active_after_min
  )
  VALUES (
    p_business_id,
    p_service_id,
    p_staff_id,
    v_customer_id,
    p_customer_name,
    NULLIF(trim(p_customer_email), ''),
    NULLIF(trim(p_customer_phone), ''),
    p_starts_at,
    v_ends_at,
    v_price_cents,
    NULLIF(trim(p_notes), ''),
    v_gap_min,
    v_active_after_min
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$function$;
