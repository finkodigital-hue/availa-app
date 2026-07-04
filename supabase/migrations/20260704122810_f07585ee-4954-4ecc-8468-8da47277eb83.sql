CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_business_id    uuid,
  p_service_id     uuid,
  p_staff_id       uuid,
  p_customer_name  text,
  p_customer_email text,
  p_customer_phone text,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_notes          text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, text
) TO anon, authenticated;