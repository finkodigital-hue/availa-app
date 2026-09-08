-- Secure, tenant-scoped gift cards.
--
-- A browser can never create value or alter a balance. Stripe purchase
-- fulfilment, complimentary issue and redemption are performed by private
-- service-role RPCs. Each balance mutation also writes an immutable ledger
-- entry in the same database transaction.

CREATE TABLE public.gift_card_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1000 AND 50000),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  purchaser_name text NOT NULL CHECK (char_length(purchaser_name) BETWEEN 1 AND 120),
  purchaser_email text NOT NULL CHECK (char_length(purchaser_email) BETWEEN 3 AND 254),
  recipient_name text NOT NULL CHECK (char_length(recipient_name) BETWEEN 1 AND 120),
  recipient_email text CHECK (recipient_email IS NULL OR char_length(recipient_email) BETWEEN 3 AND 254),
  message text CHECK (message IS NULL OR char_length(message) <= 300),
  code_hash text NOT NULL CHECK (char_length(code_hash) = 64),
  code_hint text NOT NULL CHECK (char_length(code_hint) = 4),
  display_token_hash text NOT NULL CHECK (char_length(display_token_hash) = 64),
  request_key text NOT NULL CHECK (char_length(request_key) = 64),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
  gift_card_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX gift_card_orders_business_created_idx
  ON public.gift_card_orders (business_id, created_at DESC);

CREATE TABLE public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  code_hint text NOT NULL CHECK (char_length(code_hint) BETWEEN 4 AND 8),
  initial_balance_cents integer NOT NULL CHECK (initial_balance_cents > 0),
  balance_cents integer NOT NULL CHECK (balance_cents >= 0 AND balance_cents <= initial_balance_cents),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  recipient_name text,
  recipient_email text,
  message text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'void', 'expired')),
  source text NOT NULL CHECK (source IN ('stripe_purchase', 'complimentary')),
  stripe_payment_intent_id text UNIQUE,
  expires_at timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code_hash)
);

ALTER TABLE public.gift_card_orders
  ADD CONSTRAINT gift_card_orders_gift_card_fkey
  FOREIGN KEY (gift_card_id) REFERENCES public.gift_cards(id);

CREATE INDEX gift_cards_business_created_idx
  ON public.gift_cards (business_id, created_at DESC);

CREATE TABLE public.gift_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  gift_card_id uuid NOT NULL REFERENCES public.gift_cards(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('purchase', 'issue', 'redemption', 'void')),
  amount_cents integer NOT NULL CHECK (amount_cents <> 0),
  balance_after_cents integer NOT NULL CHECK (balance_after_cents >= 0),
  idempotency_key text NOT NULL,
  note text,
  initiated_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, idempotency_key)
);

CREATE INDEX gift_card_transactions_card_created_idx
  ON public.gift_card_transactions (gift_card_id, created_at DESC);

ALTER TABLE public.gift_card_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their gift card orders"
  ON public.gift_card_orders FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = gift_card_orders.business_id AND b.owner_id = auth.uid()
  ));

CREATE POLICY "Owners can view their gift cards"
  ON public.gift_cards FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = gift_cards.business_id AND b.owner_id = auth.uid()
  ));

CREATE POLICY "Owners can view their gift card ledger"
  ON public.gift_card_transactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = gift_card_transactions.business_id AND b.owner_id = auth.uid()
  ));

REVOKE ALL PRIVILEGES ON TABLE public.gift_card_orders FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.gift_cards FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.gift_card_transactions FROM anon, authenticated;
GRANT SELECT ON public.gift_card_orders TO authenticated;
GRANT SELECT ON public.gift_cards TO authenticated;
GRANT SELECT ON public.gift_card_transactions TO authenticated;

CREATE OR REPLACE FUNCTION public.create_gift_card_order(
  p_order_id uuid,
  p_business_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_purchaser_name text,
  p_purchaser_email text,
  p_recipient_name text,
  p_recipient_email text,
  p_message text,
  p_code_hash text,
  p_code_hint text,
  p_display_token_hash text,
  p_request_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_burst_count integer;
  v_contact_count integer;
  v_request_count integer;
BEGIN
  -- Serialize the small rate-limit window for this tenant. This prevents a
  -- parallel request burst from racing every request past the count checks.
  PERFORM pg_advisory_xact_lock(hashtext(p_business_id::text || ':gift-orders'));

  SELECT count(*) INTO v_burst_count FROM public.gift_card_orders
  WHERE business_id = p_business_id AND created_at > now() - interval '60 seconds';
  IF v_burst_count >= 30 THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many gift card requests right now';
  END IF;

  SELECT count(*) INTO v_contact_count FROM public.gift_card_orders
  WHERE business_id = p_business_id
    AND created_at > now() - interval '15 minutes'
    AND lower(purchaser_email) = lower(trim(p_purchaser_email));
  IF v_contact_count >= 5 THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many gift card attempts for this email';
  END IF;

  SELECT count(*) INTO v_request_count FROM public.gift_card_orders
  WHERE business_id = p_business_id
    AND created_at > now() - interval '15 minutes'
    AND request_key = p_request_key;
  IF v_request_count >= 8 THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many gift card attempts from this connection';
  END IF;

  INSERT INTO public.gift_card_orders (
    id, business_id, amount_cents, currency, purchaser_name, purchaser_email,
    recipient_name, recipient_email, message, code_hash, code_hint,
    display_token_hash, request_key
  ) VALUES (
    p_order_id, p_business_id, p_amount_cents, lower(p_currency),
    trim(p_purchaser_name), lower(trim(p_purchaser_email)),
    trim(p_recipient_name), nullif(lower(trim(p_recipient_email)), ''),
    nullif(trim(p_message), ''), p_code_hash, p_code_hint,
    p_display_token_hash, p_request_key
  );
  RETURN p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_gift_card_purchase(
  p_order_id uuid,
  p_business_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_order public.gift_card_orders%ROWTYPE;
  v_card_id uuid;
BEGIN
  SELECT * INTO v_order
  FROM public.gift_card_orders
  WHERE id = p_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Gift card order not found'; END IF;

  IF v_order.status = 'paid' THEN
    IF v_order.stripe_checkout_session_id IS DISTINCT FROM p_stripe_checkout_session_id
       OR v_order.stripe_payment_intent_id IS DISTINCT FROM p_stripe_payment_intent_id THEN
      RAISE EXCEPTION 'Gift card order payment mismatch';
    END IF;
    RETURN v_order.gift_card_id;
  END IF;

  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'Gift card order is not payable'; END IF;
  IF v_order.amount_cents <> p_amount_cents OR v_order.currency <> lower(p_currency) THEN
    RAISE EXCEPTION 'Unexpected gift card purchase amount';
  END IF;
  IF v_order.stripe_checkout_session_id IS NOT NULL
     AND v_order.stripe_checkout_session_id <> p_stripe_checkout_session_id THEN
    RAISE EXCEPTION 'Gift card checkout session mismatch';
  END IF;

  INSERT INTO public.gift_cards (
    business_id, code_hash, code_hint, initial_balance_cents, balance_cents,
    currency, recipient_name, recipient_email, message, source,
    stripe_payment_intent_id
  ) VALUES (
    v_order.business_id, v_order.code_hash, v_order.code_hint, v_order.amount_cents,
    v_order.amount_cents, v_order.currency, v_order.recipient_name,
    v_order.recipient_email, v_order.message, 'stripe_purchase',
    p_stripe_payment_intent_id
  )
  RETURNING id INTO v_card_id;

  INSERT INTO public.gift_card_transactions (
    business_id, gift_card_id, type, amount_cents, balance_after_cents,
    idempotency_key, note
  ) VALUES (
    v_order.business_id, v_card_id, 'purchase', v_order.amount_cents,
    v_order.amount_cents, 'stripe:' || p_stripe_payment_intent_id,
    'Purchased through Stripe Checkout'
  );

  UPDATE public.gift_card_orders
  SET status = 'paid', gift_card_id = v_card_id,
      stripe_checkout_session_id = p_stripe_checkout_session_id,
      stripe_payment_intent_id = p_stripe_payment_intent_id, paid_at = now()
  WHERE id = v_order.id;

  RETURN v_card_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_gift_card(
  p_business_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_code_hash text,
  p_code_hint text,
  p_recipient_name text,
  p_recipient_email text,
  p_message text,
  p_initiated_by_user_id uuid,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_card_id uuid;
BEGIN
  IF p_amount_cents < 100 OR p_amount_cents > 50000 THEN
    RAISE EXCEPTION 'Gift card amount is outside the allowed range';
  END IF;
  IF lower(p_currency) !~ '^[a-z]{3}$' THEN RAISE EXCEPTION 'Invalid currency'; END IF;

  SELECT gift_card_id INTO v_card_id
  FROM public.gift_card_transactions
  WHERE business_id = p_business_id AND idempotency_key = p_idempotency_key;
  IF v_card_id IS NOT NULL THEN RETURN v_card_id; END IF;

  INSERT INTO public.gift_cards (
    business_id, code_hash, code_hint, initial_balance_cents, balance_cents,
    currency, recipient_name, recipient_email, message, source, created_by_user_id
  ) VALUES (
    p_business_id, p_code_hash, p_code_hint, p_amount_cents, p_amount_cents,
    lower(p_currency), nullif(trim(p_recipient_name), ''),
    nullif(trim(p_recipient_email), ''), nullif(trim(p_message), ''),
    'complimentary', p_initiated_by_user_id
  ) RETURNING id INTO v_card_id;

  INSERT INTO public.gift_card_transactions (
    business_id, gift_card_id, type, amount_cents, balance_after_cents,
    idempotency_key, note, initiated_by_user_id
  ) VALUES (
    p_business_id, v_card_id, 'issue', p_amount_cents, p_amount_cents,
    p_idempotency_key, 'Complimentary gift card', p_initiated_by_user_id
  );

  RETURN v_card_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_gift_card(
  p_business_id uuid,
  p_booking_id uuid,
  p_code_hash text,
  p_initiated_by_user_id uuid,
  p_idempotency_key text
) RETURNS TABLE (gift_card_id uuid, amount_cents integer, balance_cents integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_card public.gift_cards%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_amount integer;
  v_new_balance integer;
  v_new_paid integer;
BEGIN
  SELECT t.gift_card_id, -t.amount_cents, t.balance_after_cents
    INTO gift_card_id, amount_cents, balance_cents
  FROM public.gift_card_transactions t
  WHERE t.business_id = p_business_id AND t.idempotency_key = p_idempotency_key;
  IF gift_card_id IS NOT NULL THEN RETURN NEXT; RETURN; END IF;

  SELECT * INTO v_card FROM public.gift_cards
  WHERE business_id = p_business_id AND code_hash = p_code_hash
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift card not found'; END IF;
  IF v_card.status <> 'active' OR v_card.balance_cents <= 0 THEN
    RAISE EXCEPTION 'Gift card has no available balance';
  END IF;
  IF v_card.expires_at IS NOT NULL AND v_card.expires_at <= now() THEN
    UPDATE public.gift_cards SET status = 'expired', updated_at = now() WHERE id = v_card.id;
    RAISE EXCEPTION 'Gift card has expired';
  END IF;

  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot pay a cancelled booking'; END IF;

  v_amount := LEAST(v_card.balance_cents,
    GREATEST(0, COALESCE(v_booking.price_cents, 0) - COALESCE(v_booking.amount_paid_cents, 0)));
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Booking is already paid in full'; END IF;
  v_new_balance := v_card.balance_cents - v_amount;
  v_new_paid := COALESCE(v_booking.amount_paid_cents, 0) + v_amount;

  UPDATE public.gift_cards
  SET balance_cents = v_new_balance,
      status = CASE WHEN v_new_balance = 0 THEN 'redeemed' ELSE 'active' END,
      updated_at = now()
  WHERE id = v_card.id;

  UPDATE public.bookings
  SET amount_paid_cents = v_new_paid,
      payment_status = CASE
        WHEN v_new_paid >= COALESCE(price_cents, 0) THEN 'paid'
        ELSE 'deposit_paid'
      END
  WHERE id = v_booking.id;

  INSERT INTO public.gift_card_transactions (
    business_id, gift_card_id, booking_id, type, amount_cents,
    balance_after_cents, idempotency_key, note, initiated_by_user_id
  ) VALUES (
    p_business_id, v_card.id, v_booking.id, 'redemption', -v_amount,
    v_new_balance, p_idempotency_key, 'Applied to booking', p_initiated_by_user_id
  );

  gift_card_id := v_card.id;
  amount_cents := v_amount;
  balance_cents := v_new_balance;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_gift_card_purchase(uuid,uuid,integer,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_gift_card_order(uuid,uuid,integer,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_gift_card(uuid,integer,text,text,text,text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_gift_card(uuid,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_gift_card_purchase(uuid,uuid,integer,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_gift_card_order(uuid,uuid,integer,text,text,text,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_gift_card(uuid,integer,text,text,text,text,text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card(uuid,uuid,text,uuid,text) TO service_role;
