-- Full-refund-only v1: an owner can refund every succeeded charge on a
-- booking back to the customer's original card via Stripe. Refunding is a
-- separate action from cancelling — it never touches booking.status.
--
-- Mirrors fulfill_stripe_checkout / fulfill_stripe_balance_payment: the
-- booking's payment_status is only ever set here, from a confirmed
-- refund.updated webhook event, never optimistically from the owner's
-- initiating request.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS initiated_by_user_id uuid REFERENCES auth.users(id);

-- A refund and its original charge deliberately share a payment intent.
-- Keep charge fulfilment idempotent without blocking refund/failure audit rows.
DROP INDEX IF EXISTS public.payments_stripe_payment_intent_unique;
CREATE UNIQUE INDEX payments_stripe_payment_intent_unique
  ON public.payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL AND type = 'charge';

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_refund_unique
  ON public.payments (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fulfill_stripe_refund(
  p_business_id uuid,
  p_booking_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_stripe_refund_id text,
  p_stripe_payment_intent_id text,
  p_initiated_by_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_charge_amount integer;
  v_new_refunded integer;
BEGIN
  -- Idempotency: a retried/duplicate webhook delivery for the same Stripe
  -- refund must never be applied twice.
  IF EXISTS (SELECT 1 FROM payments WHERE stripe_refund_id = p_stripe_refund_id) THEN
    RETURN p_booking_id;
  END IF;

  -- The refund must correspond to a charge we actually recorded for this
  -- booking, and must match that charge's amount exactly (v1 is
  -- full-refund-per-charge only).
  SELECT amount_cents INTO v_charge_amount
  FROM payments
  WHERE booking_id = p_booking_id AND business_id = p_business_id
    AND type = 'charge' AND status = 'succeeded'
    AND stripe_payment_intent_id = p_stripe_payment_intent_id;
  IF v_charge_amount IS NULL THEN
    RAISE EXCEPTION 'No matching succeeded charge for this refund';
  END IF;
  IF p_amount_cents <> v_charge_amount THEN
    RAISE EXCEPTION 'Unexpected Stripe refund amount';
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found for refund'; END IF;

  v_new_refunded := v_booking.amount_refunded_cents + p_amount_cents;

  UPDATE bookings
  SET amount_refunded_cents = v_new_refunded,
      payment_status = CASE WHEN v_new_refunded >= amount_paid_cents THEN 'refunded' ELSE 'partially_refunded' END
  WHERE id = p_booking_id;

  INSERT INTO payments (business_id, booking_id, stripe_payment_intent_id, stripe_refund_id,
    type, status, amount_cents, currency, customer_name, customer_email, description, initiated_by_user_id)
  VALUES (p_business_id, p_booking_id, p_stripe_payment_intent_id, p_stripe_refund_id,
    'refund', 'succeeded', p_amount_cents, lower(p_currency), v_booking.customer_name,
    v_booking.customer_email, 'Refund', p_initiated_by_user_id);

  RETURN p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_stripe_refund(uuid,uuid,integer,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_stripe_refund(uuid,uuid,integer,text,text,text,uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_stripe_refund(uuid,uuid,integer,text,text,text,uuid) TO service_role;
