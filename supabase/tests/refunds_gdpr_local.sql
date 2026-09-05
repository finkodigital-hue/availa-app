\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.erase_customer(uuid,uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.erase_customer(uuid,uuid,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.erase_customer(uuid,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'erase_customer execute permissions are unsafe';
  END IF;

  IF has_function_privilege('anon', 'public.fulfill_stripe_refund(uuid,uuid,integer,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fulfill_stripe_refund(uuid,uuid,integer,text,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fulfill_stripe_refund(uuid,uuid,integer,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fulfill_stripe_refund execute permissions are unsafe';
  END IF;
END;
$$;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-one@local.test', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-two@local.test', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'shared-customer@local.test', now(), now());

INSERT INTO public.businesses (id, owner_id, name, slug)
VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Local Test Salon One', 'local-test-salon-one'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Local Test Salon Two', 'local-test-salon-two');

INSERT INTO public.services (id, business_id, name, price_cents, currency)
VALUES ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Local Test Service', 10000, 'GBP');

INSERT INTO public.staff (id, business_id, name)
VALUES ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Local Test Staff');

INSERT INTO public.customers (
  id, business_id, name, email, phone, address, notes, avatar_url,
  auth_user_id, stripe_customer_id, external_id
)
VALUES
  (
    '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    'Future Booking Customer', 'future@local.test', '+44 7000 000001', 'Future address', 'Future notes',
    '20000000-0000-0000-0000-000000000001/customers/future.jpg', NULL, 'cus_future', 'legacy-future'
  ),
  (
    '50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
    'Shared Customer', 'shared-customer@local.test', '+44 7000 000002', 'Private address', 'Private notes',
    '20000000-0000-0000-0000-000000000001/customers/shared.jpg',
    '10000000-0000-0000-0000-000000000003', 'cus_shared_one', 'legacy-shared-one'
  ),
  (
    '50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002',
    'Shared Customer', 'shared-customer@local.test', '+44 7000 000003', NULL, NULL, NULL,
    '10000000-0000-0000-0000-000000000003', 'cus_shared_two', 'legacy-shared-two'
  ),
  (
    '50000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
    'Refund Customer', 'refund@local.test', NULL, NULL, NULL, NULL, NULL, 'cus_refund', NULL
  );

INSERT INTO public.bookings (
  id, business_id, service_id, staff_id, customer_id, customer_name, customer_email,
  customer_phone, starts_at, ends_at, status, price_cents, notes, payment_status,
  amount_due_cents, amount_paid_cents, amount_refunded_cents
)
VALUES
  (
    '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001', 'Future Booking Customer', 'future@local.test',
    '+44 7000 000001', now() + interval '7 days', now() + interval '7 days 1 hour',
    'confirmed', 10000, 'Must remain untouched', 'unpaid', 10000, 0, 0
  ),
  (
    '60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002', 'Shared Customer', 'shared-customer@local.test',
    '+44 7000 000002', now() - interval '30 days', now() - interval '30 days' + interval '1 hour',
    'completed', 10000, 'Sensitive booking notes', 'paid', 0, 10000, 0
  ),
  (
    '60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002', 'Shared Customer', 'shared-customer@local.test',
    '+44 7000 000002', now() + interval '14 days', now() + interval '14 days 1 hour',
    'cancelled', 10000, 'Cancelled notes', 'unpaid', 10000, 0, 0
  ),
  (
    '60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000004', 'Refund Customer', 'refund@local.test',
    NULL, now() - interval '10 days', now() - interval '10 days' + interval '1 hour',
    'completed', 10000, NULL, 'paid', 0, 10000, 0
  );

INSERT INTO public.payments (
  id, business_id, booking_id, stripe_payment_intent_id, type, status,
  amount_cents, currency, customer_name, customer_email
)
VALUES
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'pi_erasure', 'charge', 'succeeded', 10000, 'gbp', 'Shared Customer', 'shared-customer@local.test'),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'pi_deposit', 'charge', 'succeeded', 3000, 'gbp', 'Refund Customer', 'refund@local.test'),
  ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'pi_balance', 'charge', 'succeeded', 7000, 'gbp', 'Refund Customer', 'refund@local.test');

INSERT INTO public.customer_data_requests (id, business_id, customer_id, email, kind)
VALUES
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'future@local.test', 'deletion'),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'shared-customer@local.test', 'deletion');

INSERT INTO public.notifications (id, business_id, type, title, body)
VALUES
  ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'booking_created', 'New booking: Shared Customer', 'Sensitive notification'),
  ('90000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'booking_created', 'Unrelated notification', 'Shared Customer appears only in this body');

DO $$
BEGIN
  BEGIN
    PERFORM public.erase_customer(
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001'
    );
    RAISE EXCEPTION 'expected upcoming-booking erasure block';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'UPCOMING_BOOKINGS:1%' THEN
      RAISE EXCEPTION 'wrong upcoming-booking error: %', SQLERRM;
    END IF;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = '50000000-0000-0000-0000-000000000001'
      AND name = 'Future Booking Customer' AND email = 'future@local.test'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.customer_data_requests
    WHERE id = '80000000-0000-0000-0000-000000000001' AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'blocked erasure changed customer or request data';
  END IF;
END;
$$;

CREATE TEMP TABLE gdpr_test_result (value jsonb);
GRANT INSERT, SELECT ON gdpr_test_result TO service_role;

-- PostgREST sets this claim when the server client uses the service-role key.
-- A direct psql test session must emulate it for auth.role() checks in triggers.
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SET LOCAL ROLE service_role;
INSERT INTO gdpr_test_result
SELECT public.erase_customer(
  '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001'
);
RESET ROLE;

DO $$
DECLARE
  result jsonb;
BEGIN
  SELECT value INTO result FROM gdpr_test_result;
  IF result->>'bookings_scrubbed' <> '2'
     OR result->>'payments_scrubbed' <> '1'
     OR (result->>'notifications_deleted')::integer < 1
     OR result->>'other_business_has_live_email' <> 'true' THEN
    RAISE EXCEPTION 'unexpected erasure result: %', result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = '50000000-0000-0000-0000-000000000002'
      AND name = 'Deleted customer'
      AND email IS NULL AND phone IS NULL AND phone_normalized IS NULL
      AND address IS NULL AND notes IS NULL AND avatar_url IS NULL
      AND auth_user_id IS NULL AND stripe_customer_id IS NULL AND external_id IS NULL
  ) THEN
    RAISE EXCEPTION 'customer identifiers were not fully erased';
  END IF;

  IF (SELECT count(*) FROM public.bookings
      WHERE customer_id = '50000000-0000-0000-0000-000000000002'
        AND customer_name = 'Deleted customer' AND customer_email IS NULL
        AND customer_phone IS NULL AND notes IS NULL) <> 2 THEN
    RAISE EXCEPTION 'booking PII was not fully scrubbed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = '60000000-0000-0000-0000-000000000002'
      AND status = 'completed' AND price_cents = 10000 AND amount_paid_cents = 10000
      AND service_id = '30000000-0000-0000-0000-000000000001'
      AND staff_id = '40000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'required booking records were not retained';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE id = '70000000-0000-0000-0000-000000000001'
      AND customer_name = 'Deleted customer' AND customer_email IS NULL
      AND amount_cents = 10000 AND status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'payment PII or retained financial data is wrong';
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.notifications
       WHERE business_id = '20000000-0000-0000-0000-000000000001'
         AND title IN ('New booking: Shared Customer', 'Booking cancelled: Shared Customer')
     )
     OR NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = '90000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'notification deletion was not correctly scoped';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customer_data_requests
    WHERE id = '80000000-0000-0000-0000-000000000002'
      AND status = 'completed' AND resolved_at IS NOT NULL
      AND resolved_by = '10000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'erasure request was not resolved correctly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = '50000000-0000-0000-0000-000000000003'
      AND email = 'shared-customer@local.test'
      AND auth_user_id = '10000000-0000-0000-0000-000000000003'
  ) OR public.find_auth_user_id_by_email('shared-customer@local.test') IS NULL THEN
    RAISE EXCEPTION 'shared login or other salon customer was changed';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.fulfill_stripe_refund(
      '20000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000003',
      2999, 'gbp', 're_wrong_amount', 'pi_deposit',
      '10000000-0000-0000-0000-000000000001'
    );
    RAISE EXCEPTION 'expected refund amount rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Unexpected Stripe refund amount' THEN
      RAISE EXCEPTION 'wrong refund validation error: %', SQLERRM;
    END IF;
  END;
END;
$$;

SET LOCAL ROLE service_role;
SELECT public.fulfill_stripe_refund(
  '20000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000003',
  3000, 'gbp', 're_deposit', 'pi_deposit',
  '10000000-0000-0000-0000-000000000001'
);
SELECT public.fulfill_stripe_refund(
  '20000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000003',
  3000, 'gbp', 're_deposit', 'pi_deposit',
  '10000000-0000-0000-0000-000000000001'
);
RESET ROLE;

DO $$
BEGIN
  IF (SELECT amount_refunded_cents FROM public.bookings WHERE id = '60000000-0000-0000-0000-000000000003') <> 3000
     OR (SELECT payment_status FROM public.bookings WHERE id = '60000000-0000-0000-0000-000000000003') <> 'partially_refunded'
     OR (SELECT count(*) FROM public.payments WHERE stripe_refund_id = 're_deposit') <> 1 THEN
    RAISE EXCEPTION 'duplicate refund webhook was not idempotent';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
SELECT public.fulfill_stripe_refund(
  '20000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000003',
  7000, 'GBP', 're_balance', 'pi_balance',
  '10000000-0000-0000-0000-000000000001'
);
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = '60000000-0000-0000-0000-000000000003'
      AND status = 'completed' AND payment_status = 'refunded'
      AND amount_paid_cents = 10000 AND amount_refunded_cents = 10000
  ) OR (SELECT count(*) FROM public.payments
        WHERE booking_id = '60000000-0000-0000-0000-000000000003'
          AND type = 'refund' AND status = 'succeeded') <> 2
     OR EXISTS (
       SELECT 1 FROM public.payments
       WHERE booking_id = '60000000-0000-0000-0000-000000000003'
         AND type = 'refund'
         AND initiated_by_user_id <> '10000000-0000-0000-0000-000000000001'
     ) THEN
    RAISE EXCEPTION 'full multi-charge refund result is incorrect';
  END IF;
END;
$$;

ROLLBACK;

\echo 'refunds_gdpr_local: all assertions passed'
