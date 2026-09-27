-- Dated receipts, independent of appointment dates. Existing Stripe transactions
-- remain the source of truth; never invent dates or methods for old manual money.
-- Preserve the existing card default used by Stripe and existing cash rows.
ALTER TABLE public.payments DROP CONSTRAINT payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'other', 'unknown'));
ALTER TABLE public.payments ADD COLUMN recording_key uuid;
CREATE UNIQUE INDEX payments_recording_key_unique
  ON public.payments(business_id, recording_key) WHERE recording_key IS NOT NULL;

CREATE FUNCTION public.capture_initial_manual_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Staff booking creation records money received now. CSV imports use 'manual'
  -- and must not turn historical receipts into today's takings.
  IF NEW.source = 'walkin' AND NEW.stripe_payment_intent_id IS NULL
     AND NEW.amount_paid_cents > 0 THEN
    INSERT INTO payments(business_id, booking_id, type, status, amount_cents,
      currency, customer_name, description, payment_method)
    SELECT NEW.business_id, NEW.id, 'charge', 'succeeded', NEW.amount_paid_cents,
      lower(b.currency), NEW.customer_name, 'Payment recorded with booking', 'unknown'
    FROM businesses b WHERE b.id = NEW.business_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_initial_manual_receipt() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER capture_initial_manual_receipt AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.capture_initial_manual_receipt();

CREATE FUNCTION public.record_manual_receipt(
  p_business_id uuid, p_booking_id uuid, p_amount_cents integer,
  p_method text, p_key uuid, p_actor uuid, p_currency text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE b bookings%ROWTYPE; receipt payments%ROWTYPE; result uuid; paid integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id AND owner_id = p_actor AND deletion_requested_at IS NULL)
    THEN RAISE EXCEPTION 'Business not found'; END IF;
  IF p_key IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0
     OR p_method IS NULL OR p_method NOT IN ('cash','card','bank_transfer','other')
    THEN RAISE EXCEPTION 'Enter a valid amount and payment method'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('manual-receipt:' || p_business_id::text || ':' || p_key::text));
  PERFORM pg_advisory_xact_lock(hashtext('balance:' || p_booking_id::text));
  SELECT * INTO b FROM bookings WHERE id = p_booking_id AND business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  SELECT * INTO receipt FROM payments WHERE business_id = p_business_id AND recording_key = p_key;
  IF FOUND THEN
    IF receipt.booking_id IS DISTINCT FROM p_booking_id OR receipt.amount_cents IS DISTINCT FROM p_amount_cents
      OR receipt.payment_method IS DISTINCT FROM p_method OR receipt.currency IS DISTINCT FROM lower(p_currency)
      OR receipt.initiated_by_user_id IS DISTINCT FROM p_actor
      THEN RAISE EXCEPTION 'This recording request has already been used'; END IF;
    RETURN receipt.id;
  END IF;
  IF b.status = 'cancelled' OR b.amount_refunded_cents > 0 OR b.payment_status IN ('refunded','partially_refunded')
    THEN RAISE EXCEPTION 'Cannot add a payment to a cancelled or refunded booking'; END IF;
  IF p_currency IS NULL OR lower(p_currency) IS DISTINCT FROM (SELECT lower(currency) FROM businesses WHERE id=p_business_id)
    OR EXISTS (SELECT 1 FROM payments WHERE booking_id=b.id AND type='charge' AND status='succeeded' AND lower(currency)<>lower(p_currency))
    THEN RAISE EXCEPTION 'Booking currency has changed. Reopen the booking before recording payment'; END IF;
  IF EXISTS (SELECT 1 FROM balance_checkout_attempts WHERE booking_id=b.id AND state IN ('active','review'))
    THEN RAISE EXCEPTION 'An existing card checkout must be resolved before recording another payment. Check the card payment status first'; END IF;
  -- Older fully paid bookings sometimes have no recorded amount: never charge twice.
  paid := CASE WHEN b.payment_status = 'paid' THEN greatest(b.price_cents, b.amount_paid_cents)
    ELSE b.amount_paid_cents END;
  IF p_amount_cents > greatest(0, b.price_cents - paid)
    THEN RAISE EXCEPTION 'Amount exceeds the remaining balance'; END IF;
  INSERT INTO payments(business_id, booking_id, type, status, amount_cents, currency,
    customer_name, description, payment_method, recording_key, initiated_by_user_id)
  SELECT p_business_id, b.id, 'charge', 'succeeded', p_amount_cents, lower(currency),
    b.customer_name, 'Payment received in person', p_method, p_key, p_actor
  FROM businesses WHERE id = p_business_id RETURNING id INTO result;
  UPDATE bookings SET amount_paid_cents = paid + p_amount_cents,
    amount_due_cents = greatest(0, price_cents - paid - p_amount_cents),
    payment_status = CASE WHEN paid + p_amount_cents >= price_cents THEN 'paid' ELSE 'deposit_paid' END
  WHERE id = b.id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_manual_receipt(uuid,uuid,integer,text,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_receipt(uuid,uuid,integer,text,uuid,uuid,text) TO service_role;

CREATE FUNCTION public.get_daily_takings(p_business_id uuid, p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tz text; result jsonb;
BEGIN
  SELECT coalesce(nullif(timezone,''), 'Europe/London') INTO tz FROM businesses WHERE id = p_business_id AND deletion_requested_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found'; END IF;
  SELECT jsonb_build_object('rows', coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'bookingId', booking_id, 'customerName', customer_name,
    'amountCents', amount_cents, 'currency', upper(currency), 'type', type,
    'method', CASE WHEN stripe_payment_intent_id IS NOT NULL THEN 'card' ELSE payment_method END,
    'createdAt', created_at, 'description', description
  ) ORDER BY created_at DESC, id), '[]'::jsonb), 'timezone', tz)
  INTO result FROM (
    SELECT id, booking_id, customer_name, amount_cents, currency, type,
      stripe_payment_intent_id, payment_method, created_at, description
    FROM payments WHERE business_id = p_business_id AND status = 'succeeded'
      AND type IN ('charge','refund')
      AND created_at >= (p_day::timestamp AT TIME ZONE tz)
      AND created_at < ((p_day + 1)::timestamp AT TIME ZONE tz)
    UNION ALL
    SELECT g.id, null::uuid, g.purchaser_name, g.amount_cents, g.currency, 'charge',
      g.stripe_payment_intent_id, 'card', g.paid_at, 'Gift card purchase'
    FROM gift_card_orders g WHERE g.business_id = p_business_id AND g.status = 'paid'
      AND g.paid_at >= (p_day::timestamp AT TIME ZONE tz)
      AND g.paid_at < ((p_day + 1)::timestamp AT TIME ZONE tz)
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.business_id = g.business_id
        AND p.stripe_payment_intent_id = g.stripe_payment_intent_id AND p.type = 'charge' AND p.status = 'succeeded')
  ) receipts;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_daily_takings(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_takings(uuid,date) TO service_role;

CREATE FUNCTION public.takings_unpaid_bookings(p_business_id uuid, p_search text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(row_to_json(b)), '[]'::jsonb) FROM (
    SELECT id, customer_name, starts_at, price_cents - amount_paid_cents AS remaining_cents
    FROM bookings WHERE business_id = p_business_id AND status <> 'cancelled'
      AND payment_status <> 'paid' AND amount_refunded_cents = 0
      AND price_cents > amount_paid_cents
      AND position(lower(coalesce(p_search, '')) in lower(customer_name)) > 0
    ORDER BY starts_at DESC, id LIMIT 50
  ) b;
$$;
REVOKE ALL ON FUNCTION public.takings_unpaid_bookings(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.takings_unpaid_bookings(uuid,text) TO service_role;
NOTIFY pgrst, 'reload schema';
