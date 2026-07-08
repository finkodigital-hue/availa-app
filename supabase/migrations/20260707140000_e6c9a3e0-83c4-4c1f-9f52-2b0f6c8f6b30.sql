
-- Independent Professionals: public booking integration.
--
-- Lets customers book an independent pro directly through the salon's public
-- /book/:slug page. Pros stay invisible as separate "businesses" to the
-- customer (per the original plan) — they simply appear as bookable staff
-- offering the salon's services, same as any employee.

-- === 1) Add a public-visibility permission the pro controls ===
-- Existing permission flags govern what the SALON can see/do on its internal
-- calendar. This one governs whether the pro is offered to the SALON'S
-- customers on the public booking page at all.
ALTER TABLE public.salon_professionals
  ALTER COLUMN permissions SET DEFAULT '{
    "salon_can_view_calendar": true,
    "salon_can_book": false,
    "salon_can_move": false,
    "salon_can_view_availability": true,
    "public_bookable": true
  }'::jsonb;

UPDATE public.salon_professionals
   SET permissions = permissions || '{"public_bookable": true}'::jsonb
 WHERE NOT (permissions ? 'public_bookable');

-- === 2) Narrow, anon-safe lookup of a salon's public-bookable pros ===
-- salon_professionals itself has no anon/public SELECT policy (it holds rent
-- terms and permission internals), so expose only what the booking page
-- needs via a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.get_public_salon_professionals(_salon_business_id uuid)
RETURNS TABLE (
  pro_business_id uuid,
  chair_label text,
  display_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.pro_business_id, sp.chair_label, sp.display_order
    FROM public.salon_professionals sp
   WHERE sp.salon_business_id = _salon_business_id
     AND sp.status = 'active'
     AND COALESCE((sp.permissions->>'public_bookable')::boolean, true)
   ORDER BY sp.display_order, sp.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_salon_professionals(uuid) TO anon, authenticated;

-- === 3) Fix a pre-existing double-booking hole in the public booking flow ===
-- anon has no SELECT policy on `bookings` at all. create_public_booking runs
-- SECURITY INVOKER (as anon, for public bookings), so its own conflict check
-- ("IF EXISTS (SELECT 1 FROM bookings WHERE staff_id = ... )") has always
-- silently seen zero rows for anonymous submissions — the advisory lock
-- serializes concurrent requests but never actually rejects an overlapping
-- one. Same gap applies to the client-side pre-check query. This was already
-- live for salon staff bookings; it would apply equally to independent pros'
-- bookings once they're publicly bookable too, so fixing it here.
--
-- Fix: a narrow, non-RLS view exposing only the columns needed to detect a
-- time clash (no customer PII), following the same pattern already used for
-- public_businesses / public_staff.
CREATE OR REPLACE VIEW public.public_booking_slots
WITH (security_invoker = off) AS
SELECT business_id, staff_id, starts_at, ends_at
  FROM public.bookings
 WHERE status <> 'cancelled';

GRANT SELECT ON public.public_booking_slots TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_public_booking(p_business_id uuid, p_service_id uuid, p_staff_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
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
    SELECT 1 FROM public_booking_slots
    WHERE staff_id = p_staff_id
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
