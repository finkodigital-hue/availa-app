-- Stripe calls the webhook after a successful hosted Checkout payment. This
-- function atomically creates the booking and payment record, so a retried
-- webhook can never create a duplicate booking.
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_payment_intent_unique
  ON public.payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fulfill_stripe_checkout(
  p_business_id uuid, p_service_id uuid, p_staff_id uuid, p_customer_name text,
  p_customer_email text, p_customer_phone text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_notes text, p_payment_mode text, p_amount_cents integer,
  p_currency text, p_stripe_payment_intent_id text, p_stripe_charge_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_booking_id uuid; v_customer_id uuid; v_price_cents integer;
  v_deposit_percent integer; v_expected_amount integer;
BEGIN
  SELECT id INTO v_booking_id FROM bookings WHERE stripe_payment_intent_id = p_stripe_payment_intent_id;
  IF v_booking_id IS NOT NULL THEN RETURN v_booking_id; END IF;

  SELECT s.price_cents, b.deposit_percent INTO v_price_cents, v_deposit_percent
  FROM services s JOIN businesses b ON b.id = s.business_id
  WHERE s.id = p_service_id AND s.business_id = p_business_id AND s.active = true;
  IF v_price_cents IS NULL THEN RAISE EXCEPTION 'Invalid service for Stripe checkout'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'Invalid staff member for Stripe checkout';
  END IF;
  IF p_payment_mode = 'full' THEN v_expected_amount := v_price_cents;
  ELSIF p_payment_mode = 'deposit' THEN v_expected_amount := round(v_price_cents * v_deposit_percent / 100.0);
  ELSE RAISE EXCEPTION 'Invalid online payment mode'; END IF;
  IF p_amount_cents <> v_expected_amount THEN RAISE EXCEPTION 'Unexpected Stripe payment amount'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_staff_id::text));
  IF EXISTS (SELECT 1 FROM bookings WHERE staff_id = p_staff_id AND status <> 'cancelled' AND starts_at < p_ends_at AND ends_at > p_starts_at) THEN
    RAISE EXCEPTION 'SLOT_TAKEN_AFTER_PAYMENT';
  END IF;

  SELECT id INTO v_customer_id FROM customers WHERE business_id = p_business_id
    AND lower(email) = lower(trim(p_customer_email)) LIMIT 1;
  IF v_customer_id IS NULL AND length(trim(p_customer_phone)) > 0 THEN
    SELECT id INTO v_customer_id FROM customers WHERE business_id = p_business_id
      AND phone = trim(p_customer_phone) LIMIT 1;
  END IF;
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (business_id, name, email, phone)
    VALUES (p_business_id, p_customer_name, NULLIF(trim(p_customer_email), ''), NULLIF(trim(p_customer_phone), ''))
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO bookings (business_id, service_id, staff_id, customer_id, customer_name,
    customer_email, customer_phone, starts_at, ends_at, price_cents, notes, payment_status,
    amount_due_cents, amount_paid_cents, stripe_payment_intent_id, stripe_charge_id)
  VALUES (p_business_id, p_service_id, p_staff_id, v_customer_id, p_customer_name,
    NULLIF(trim(p_customer_email), ''), NULLIF(trim(p_customer_phone), ''), p_starts_at,
    p_ends_at, v_price_cents, NULLIF(trim(p_notes), ''),
    CASE WHEN p_payment_mode = 'full' THEN 'paid' ELSE 'deposit_paid' END,
    GREATEST(v_price_cents - p_amount_cents, 0), p_amount_cents,
    p_stripe_payment_intent_id, p_stripe_charge_id)
  RETURNING id INTO v_booking_id;

  INSERT INTO payments (business_id, booking_id, stripe_payment_intent_id, stripe_charge_id,
    type, status, amount_cents, currency, customer_name, customer_email, description)
  VALUES (p_business_id, v_booking_id, p_stripe_payment_intent_id, p_stripe_charge_id,
    'charge', 'succeeded', p_amount_cents, lower(p_currency), p_customer_name,
    NULLIF(trim(p_customer_email), ''), CASE WHEN p_payment_mode = 'full' THEN 'Full payment' ELSE 'Deposit' END);
  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_stripe_checkout(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,integer,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_stripe_checkout(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,integer,text,text,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_stripe_checkout(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,integer,text,text,text) TO service_role;
