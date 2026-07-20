-- Completes a previously booked appointment after its remaining balance is
-- collected through a Stripe Checkout session.
CREATE OR REPLACE FUNCTION public.fulfill_stripe_balance_payment(
  p_booking_id uuid,
  p_business_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_stripe_payment_intent_id text,
  p_stripe_charge_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_remaining integer;
BEGIN
  IF EXISTS (SELECT 1 FROM payments WHERE stripe_payment_intent_id = p_stripe_payment_intent_id) THEN
    RETURN p_booking_id;
  END IF;

  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found for balance payment'; END IF;

  v_remaining := GREATEST(v_booking.price_cents - v_booking.amount_paid_cents, 0);
  IF v_remaining = 0 THEN RAISE EXCEPTION 'Booking is already paid in full'; END IF;
  IF p_amount_cents <> v_remaining THEN RAISE EXCEPTION 'Unexpected Stripe balance payment amount'; END IF;

  UPDATE bookings
  SET amount_paid_cents = price_cents,
      amount_due_cents = 0,
      payment_status = 'paid'
  WHERE id = p_booking_id;

  INSERT INTO payments (business_id, booking_id, stripe_payment_intent_id, stripe_charge_id,
    type, status, amount_cents, currency, customer_name, customer_email, description)
  VALUES (p_business_id, p_booking_id, p_stripe_payment_intent_id, p_stripe_charge_id,
    'charge', 'succeeded', p_amount_cents, lower(p_currency), v_booking.customer_name,
    v_booking.customer_email, 'Remaining balance');

  RETURN p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_stripe_balance_payment(uuid,uuid,integer,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_stripe_balance_payment(uuid,uuid,integer,text,text,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_stripe_balance_payment(uuid,uuid,integer,text,text,text) TO service_role;
