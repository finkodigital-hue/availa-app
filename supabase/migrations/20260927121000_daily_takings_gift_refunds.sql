-- Include provider-confirmed gift purchase refunds on their receipt date.
CREATE OR REPLACE FUNCTION public.get_daily_takings(p_business_id uuid, p_day date)
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
    SELECT id::text, booking_id, customer_name, amount_cents, currency, type,
      stripe_payment_intent_id, payment_method, created_at, description
    FROM payments WHERE business_id = p_business_id AND status = 'succeeded'
      AND type IN ('charge','refund')
      AND created_at >= (p_day::timestamp AT TIME ZONE tz)
      AND created_at < ((p_day + 1)::timestamp AT TIME ZONE tz)
    UNION ALL
    SELECT g.id::text, null::uuid, g.purchaser_name, g.amount_cents, g.currency, 'charge',
      g.stripe_payment_intent_id, 'card', g.paid_at, 'Gift card purchase'
    FROM gift_card_orders g WHERE g.business_id = p_business_id AND g.status = 'paid'
      AND g.paid_at >= (p_day::timestamp AT TIME ZONE tz)
      AND g.paid_at < ((p_day + 1)::timestamp AT TIME ZONE tz)
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.business_id = g.business_id
        AND p.stripe_payment_intent_id = g.stripe_payment_intent_id AND p.type = 'charge' AND p.status = 'succeeded')
    UNION ALL
    SELECT 'gift-refund:' || r.stripe_refund_id, null::uuid, g.purchaser_name,
      r.amount_cents, r.currency, 'refund', r.stripe_payment_intent_id, 'card',
      r.created_at, 'Gift card refund'
    FROM gift_card_refunds r LEFT JOIN gift_card_orders g
      ON g.business_id=r.business_id AND g.stripe_payment_intent_id=r.stripe_payment_intent_id
    WHERE r.business_id=p_business_id
      AND r.created_at >= (p_day::timestamp AT TIME ZONE tz)
      AND r.created_at < ((p_day + 1)::timestamp AT TIME ZONE tz)
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.business_id=r.business_id
        AND p.stripe_refund_id=r.stripe_refund_id AND p.type='refund' AND p.status='succeeded')
  ) receipts;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_daily_takings(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_takings(uuid,date) TO service_role;

NOTIFY pgrst, 'reload schema';
