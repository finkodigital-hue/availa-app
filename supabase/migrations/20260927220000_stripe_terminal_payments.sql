-- Stripe Terminal is server-mediated. Browser roles cannot inspect reader IDs,
-- provider account IDs, attempts, or error details. A payment only reaches the
-- ledger after the server has independently retrieved a succeeded PaymentIntent.

CREATE TABLE public.terminal_readers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL CHECK (length(stripe_account_id) BETWEEN 3 AND 255),
  stripe_location_id text NOT NULL CHECK (length(stripe_location_id) BETWEEN 3 AND 255),
  stripe_reader_id text NOT NULL CHECK (length(stripe_reader_id) BETWEEN 3 AND 255),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  device_type text,
  enabled boolean NOT NULL DEFAULT true,
  provider_status text NOT NULL DEFAULT 'unknown'
    CHECK (provider_status IN ('unknown','online','offline')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, stripe_reader_id),
  UNIQUE (stripe_account_id, stripe_reader_id)
);

CREATE INDEX terminal_readers_business_idx
  ON public.terminal_readers(business_id, enabled, label);

ALTER TABLE public.terminal_readers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.terminal_readers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.terminal_readers TO service_role;
CREATE POLICY terminal_readers_server_only ON public.terminal_readers
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.terminal_payment_attempts (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reader_id uuid NOT NULL REFERENCES public.terminal_readers(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents >= 50),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  stripe_account_id text NOT NULL,
  stripe_reader_id text NOT NULL,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  state text NOT NULL DEFAULT 'creating'
    CHECK (state IN ('creating','ready','processing','succeeded','failed','canceled','review')),
  failure_code text,
  failure_message text,
  initiated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (stripe_account_id, stripe_payment_intent_id)
);

-- At most one operation capable of charging a booking may be live. `review`
-- remains locked because the provider outcome is not yet known.
CREATE UNIQUE INDEX terminal_payment_one_active_per_booking
  ON public.terminal_payment_attempts(booking_id)
  WHERE state IN ('creating','ready','processing','review');
CREATE INDEX terminal_payment_business_created_idx
  ON public.terminal_payment_attempts(business_id, created_at DESC);

ALTER TABLE public.terminal_payment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.terminal_payment_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.terminal_payment_attempts TO service_role;
CREATE POLICY terminal_payment_attempts_server_only ON public.terminal_payment_attempts
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TRIGGER terminal_readers_set_updated_at
  BEFORE UPDATE ON public.terminal_readers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER terminal_payment_attempts_set_updated_at
  BEFORE UPDATE ON public.terminal_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- All balance-changing methods converge on the booking advisory lock. These
-- triggers also make older cash/gift/manual functions reject a competing
-- Terminal attempt without copying those large functions into this migration.
CREATE FUNCTION public.block_checkout_during_terminal_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM terminal_payment_attempts
      WHERE booking_id=NEW.booking_id AND state IN ('creating','ready','processing','review'))
    THEN RAISE EXCEPTION 'A card reader payment must be resolved first'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_checkout_during_terminal_attempt() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER balance_checkout_blocks_terminal
  BEFORE INSERT ON public.balance_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.block_checkout_during_terminal_attempt();

CREATE FUNCTION public.guard_booking_balance_during_terminal_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a terminal_payment_attempts%ROWTYPE;
BEGIN
  IF NEW.amount_paid_cents<=OLD.amount_paid_cents THEN RETURN NEW; END IF;
  SELECT * INTO a FROM terminal_payment_attempts
    WHERE booking_id=NEW.id AND state IN ('creating','ready','processing','review') LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  -- fulfill_terminal_payment writes this immutable provider receipt first in
  -- the same transaction. No browser role can create such a ledger row.
  IF NOT EXISTS (SELECT 1 FROM payments p
      WHERE p.booking_id=NEW.id AND p.business_id=NEW.business_id
        AND p.type='charge' AND p.status='succeeded'
        AND p.stripe_payment_intent_id=a.stripe_payment_intent_id
        AND p.amount_cents=a.amount_cents AND lower(p.currency)=a.currency)
    THEN RAISE EXCEPTION 'A card reader payment must be resolved before changing the balance'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_booking_balance_during_terminal_attempt() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_booking_balance_during_terminal
  BEFORE UPDATE OF amount_paid_cents ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_balance_during_terminal_attempt();

CREATE FUNCTION public.upsert_terminal_reader(
  p_business_id uuid,
  p_stripe_account_id text,
  p_stripe_location_id text,
  p_stripe_reader_id text,
  p_label text,
  p_device_type text,
  p_provider_status text DEFAULT 'unknown'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE b businesses%ROWTYPE; r terminal_readers%ROWTYPE;
BEGIN
  SELECT * INTO b FROM businesses
    WHERE id=p_business_id AND deletion_requested_at IS NULL FOR UPDATE;
  IF NOT FOUND OR b.stripe_account_id IS NULL OR b.stripe_account_id<>p_stripe_account_id
    THEN RAISE EXCEPTION 'Terminal account does not match the business'; END IF;
  IF nullif(btrim(p_stripe_location_id),'') IS NULL
     OR nullif(btrim(p_stripe_reader_id),'') IS NULL
     OR nullif(btrim(p_label),'') IS NULL
     OR p_provider_status NOT IN ('unknown','online','offline')
    THEN RAISE EXCEPTION 'Invalid Terminal reader'; END IF;
  INSERT INTO terminal_readers(business_id,stripe_account_id,stripe_location_id,
    stripe_reader_id,label,device_type,provider_status,last_seen_at)
  VALUES(b.id,p_stripe_account_id,p_stripe_location_id,p_stripe_reader_id,
    left(btrim(p_label),120),nullif(p_device_type,''),p_provider_status,
    CASE WHEN p_provider_status='online' THEN now() END)
  ON CONFLICT (business_id,stripe_reader_id) DO UPDATE SET
    stripe_account_id=excluded.stripe_account_id,
    stripe_location_id=excluded.stripe_location_id,
    label=excluded.label,
    device_type=excluded.device_type,
    provider_status=excluded.provider_status,
    last_seen_at=CASE WHEN excluded.provider_status='online' THEN now()
      ELSE terminal_readers.last_seen_at END,
    enabled=true
  RETURNING * INTO r;
  RETURN to_jsonb(r);
END;
$$;

CREATE FUNCTION public.claim_terminal_payment(
  p_business_id uuid,
  p_booking_id uuid,
  p_reader_id uuid,
  p_request_id uuid,
  p_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE b businesses%ROWTYPE; bk bookings%ROWTYPE; r terminal_readers%ROWTYPE;
  a terminal_payment_attempts%ROWTYPE; remaining integer;
BEGIN
  IF p_request_id IS NULL OR p_actor IS NULL THEN RAISE EXCEPTION 'Invalid Terminal request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('terminal-request:'||p_request_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('balance:'||p_booking_id::text));

  SELECT * INTO a FROM terminal_payment_attempts WHERE id=p_request_id;
  IF FOUND THEN
    IF a.business_id IS DISTINCT FROM p_business_id OR a.booking_id IS DISTINCT FROM p_booking_id
      OR a.reader_id IS DISTINCT FROM p_reader_id OR a.initiated_by_user_id IS DISTINCT FROM p_actor
      THEN RAISE EXCEPTION 'Terminal request identity mismatch'; END IF;
    RETURN to_jsonb(a);
  END IF;

  SELECT * INTO b FROM businesses
    WHERE id=p_business_id AND owner_id=p_actor AND deletion_requested_at IS NULL;
  IF NOT FOUND OR b.stripe_account_id IS NULL OR NOT b.stripe_charges_enabled
    THEN RAISE EXCEPTION 'Card reader payments are unavailable'; END IF;
  SELECT * INTO r FROM terminal_readers
    WHERE id=p_reader_id AND business_id=b.id AND stripe_account_id=b.stripe_account_id AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card reader is unavailable'; END IF;
  SELECT * INTO bk FROM bookings WHERE id=p_booking_id AND business_id=b.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF bk.status='cancelled' OR bk.amount_refunded_cents>0
     OR bk.payment_status IN ('refunded','partially_refunded')
    THEN RAISE EXCEPTION 'This booking needs payment review'; END IF;
  IF EXISTS (SELECT 1 FROM balance_checkout_attempts
      WHERE booking_id=bk.id AND state IN ('active','review'))
    THEN RAISE EXCEPTION 'An online card checkout must be resolved first'; END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE booking_id=bk.id AND type='charge'
      AND status='succeeded' AND lower(currency)<>lower(b.currency))
    THEN RAISE EXCEPTION 'Booking currency has changed; payment review is required'; END IF;
  remaining:=greatest(0,bk.price_cents-
    CASE WHEN bk.payment_status='paid' THEN greatest(bk.price_cents,bk.amount_paid_cents)
      ELSE bk.amount_paid_cents END);
  IF remaining<50 THEN RAISE EXCEPTION 'There is no remaining balance to collect'; END IF;

  INSERT INTO terminal_payment_attempts(id,business_id,booking_id,reader_id,
    amount_cents,currency,stripe_account_id,stripe_reader_id,initiated_by_user_id)
  VALUES(p_request_id,b.id,bk.id,r.id,remaining,lower(b.currency),
    b.stripe_account_id,r.stripe_reader_id,p_actor) RETURNING * INTO a;
  RETURN to_jsonb(a);
END;
$$;

CREATE FUNCTION public.attach_terminal_payment_intent(
  p_attempt_id uuid,
  p_payment_intent_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF nullif(p_payment_intent_id,'') IS NULL THEN RAISE EXCEPTION 'Invalid PaymentIntent'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('terminal-attempt:'||p_attempt_id::text));
  UPDATE terminal_payment_attempts SET stripe_payment_intent_id=p_payment_intent_id,state='ready',
    failure_code=NULL,failure_message=NULL
  WHERE id=p_attempt_id AND state IN ('creating','ready')
    AND (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id=p_payment_intent_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Terminal attempt cannot accept this PaymentIntent'; END IF;
END;
$$;

-- Called only after the server has retrieved the PaymentIntent/reader state.
CREATE FUNCTION public.close_terminal_payment(
  p_attempt_id uuid,
  p_payment_intent_id text,
  p_state text,
  p_failure_code text DEFAULT NULL,
  p_failure_message text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_state NOT IN ('failed','canceled','review')
    THEN RAISE EXCEPTION 'Invalid Terminal close state'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('terminal-attempt:'||p_attempt_id::text));
  UPDATE terminal_payment_attempts SET state=p_state,
    failure_code=left(nullif(p_failure_code,''),120),
    failure_message=left(nullif(p_failure_message,''),500),
    completed_at=CASE WHEN p_state IN ('failed','canceled') THEN now() ELSE NULL END
  WHERE id=p_attempt_id
    AND ((stripe_payment_intent_id IS NULL AND nullif(p_payment_intent_id,'') IS NULL)
      OR stripe_payment_intent_id=nullif(p_payment_intent_id,''))
    AND state IN ('creating','ready','processing','review');
  IF NOT FOUND THEN RAISE EXCEPTION 'Terminal attempt cannot be closed'; END IF;
END;
$$;

-- The caller must first retrieve a succeeded PaymentIntent directly from Stripe.
-- Identity, amount and currency are rechecked under the booking balance lock.
CREATE FUNCTION public.fulfill_terminal_payment(
  p_attempt_id uuid,
  p_payment_intent_id text,
  p_charge_id text,
  p_amount_cents integer,
  p_currency text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a terminal_payment_attempts%ROWTYPE; bk bookings%ROWTYPE; previous payments%ROWTYPE;
  paid integer; result uuid;
BEGIN
  IF nullif(p_payment_intent_id,'') IS NULL OR p_amount_cents IS NULL OR p_amount_cents<=0
     OR p_currency IS NULL THEN RAISE EXCEPTION 'Invalid Terminal payment'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('terminal-attempt:'||p_attempt_id::text));
  SELECT * INTO a FROM terminal_payment_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Terminal attempt not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('balance:'||a.booking_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('payment:'||p_payment_intent_id));

  IF a.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id
     OR a.amount_cents IS DISTINCT FROM p_amount_cents
     OR a.currency IS DISTINCT FROM lower(p_currency)
    THEN RAISE EXCEPTION 'Terminal payment identity mismatch'; END IF;
  SELECT * INTO previous FROM payments
    WHERE stripe_payment_intent_id=p_payment_intent_id AND type='charge';
  IF FOUND THEN
    IF previous.business_id IS DISTINCT FROM a.business_id OR previous.booking_id IS DISTINCT FROM a.booking_id
       OR previous.amount_cents IS DISTINCT FROM a.amount_cents
       OR lower(previous.currency) IS DISTINCT FROM a.currency OR previous.status<>'succeeded'
      THEN RAISE EXCEPTION 'Terminal ledger identity mismatch'; END IF;
    UPDATE terminal_payment_attempts SET state='succeeded',stripe_charge_id=coalesce(stripe_charge_id,p_charge_id),
      completed_at=coalesce(completed_at,now()),failure_code=NULL,failure_message=NULL WHERE id=a.id;
    RETURN previous.id;
  END IF;
  SELECT * INTO bk FROM bookings WHERE id=a.booking_id AND business_id=a.business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF bk.status='cancelled' OR bk.amount_refunded_cents>0
     OR bk.payment_status IN ('refunded','partially_refunded')
    THEN RAISE EXCEPTION 'This booking needs payment review'; END IF;
  paid:=CASE WHEN bk.payment_status='paid' THEN greatest(bk.price_cents,bk.amount_paid_cents)
    ELSE bk.amount_paid_cents END;
  IF greatest(0,bk.price_cents-paid) IS DISTINCT FROM a.amount_cents
    THEN RAISE EXCEPTION 'Booking balance changed; Terminal payment needs review'; END IF;

  INSERT INTO payments(business_id,booking_id,stripe_payment_intent_id,stripe_charge_id,
    type,status,amount_cents,currency,payment_method,customer_name,customer_email,
    description,initiated_by_user_id)
  VALUES(a.business_id,a.booking_id,p_payment_intent_id,nullif(p_charge_id,''),
    'charge','succeeded',a.amount_cents,a.currency,'card',bk.customer_name,bk.customer_email,
    'Card reader payment',a.initiated_by_user_id) RETURNING id INTO result;
  UPDATE bookings SET amount_paid_cents=paid+a.amount_cents,
    amount_due_cents=greatest(0,price_cents-paid-a.amount_cents),
    payment_status=CASE WHEN paid+a.amount_cents>=price_cents THEN 'paid' ELSE 'deposit_paid' END,
    stripe_payment_intent_id=p_payment_intent_id,
    stripe_charge_id=coalesce(nullif(p_charge_id,''),stripe_charge_id)
  WHERE id=bk.id;
  UPDATE terminal_payment_attempts SET state='succeeded',stripe_charge_id=nullif(p_charge_id,''),
    completed_at=now(),failure_code=NULL,failure_message=NULL WHERE id=a.id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_terminal_reader(uuid,text,text,text,text,text,text),
  public.claim_terminal_payment(uuid,uuid,uuid,uuid,uuid),
  public.attach_terminal_payment_intent(uuid,text),
  public.close_terminal_payment(uuid,text,text,text,text),
  public.fulfill_terminal_payment(uuid,text,text,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_terminal_reader(uuid,text,text,text,text,text,text),
  public.claim_terminal_payment(uuid,uuid,uuid,uuid,uuid),
  public.attach_terminal_payment_intent(uuid,text),
  public.close_terminal_payment(uuid,text,text,text,text),
  public.fulfill_terminal_payment(uuid,text,text,integer,text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
