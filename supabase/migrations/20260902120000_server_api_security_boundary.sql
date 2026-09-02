-- Security boundary hardening
--
-- Browser requests now travel through Bookzenvo's same-origin server gateway,
-- but PostgreSQL remains the final authorization boundary. These guards stop
-- an authenticated owner from using a captured session in DevTools to forge a
-- paid plan, Stripe state, or verified payment ledger entries.

CREATE OR REPLACE FUNCTION public.protect_business_system_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') AND (
    (TG_OP = 'INSERT' AND (
      NEW.plan IS DISTINCT FROM 'free' OR
      NEW.stripe_account_id IS NOT NULL OR
      NEW.stripe_charges_enabled IS DISTINCT FROM false OR
      NEW.stripe_details_submitted IS DISTINCT FROM false OR
      NEW.stripe_billing_customer_id IS NOT NULL OR
      NEW.stripe_subscription_id IS NOT NULL OR
      NEW.stripe_subscription_status IS NOT NULL OR
      NEW.billing_synced_at IS NOT NULL OR
      NEW.hide_powered_by IS DISTINCT FROM false OR
      NEW.reminder_hours_before IS DISTINCT FROM 24
    )) OR
    (TG_OP = 'UPDATE' AND (
      NEW.plan IS DISTINCT FROM OLD.plan OR
      NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id OR
      NEW.stripe_charges_enabled IS DISTINCT FROM OLD.stripe_charges_enabled OR
      NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted OR
      NEW.stripe_billing_customer_id IS DISTINCT FROM OLD.stripe_billing_customer_id OR
      NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id OR
      NEW.stripe_subscription_status IS DISTINCT FROM OLD.stripe_subscription_status OR
      NEW.billing_synced_at IS DISTINCT FROM OLD.billing_synced_at OR
      NEW.hide_powered_by IS DISTINCT FROM OLD.hide_powered_by OR
      NEW.reminder_hours_before IS DISTINCT FROM OLD.reminder_hours_before
    ))
  ) THEN
    RAISE EXCEPTION 'SYSTEM_FIELD: billing, plan, payment-provider and paid-feature fields are server-managed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_business_system_fields ON public.businesses;
CREATE TRIGGER protect_business_system_fields
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_business_system_fields();

REVOKE EXECUTE ON FUNCTION public.protect_business_system_fields() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_booking_payment_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF (TG_OP = 'INSERT' AND (
      NEW.stripe_payment_intent_id IS NOT NULL OR
      NEW.stripe_charge_id IS NOT NULL OR
      NEW.amount_refunded_cents IS DISTINCT FROM 0
    )) OR (TG_OP = 'UPDATE' AND (
      NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id OR
      NEW.stripe_charge_id IS DISTINCT FROM OLD.stripe_charge_id OR
      NEW.amount_refunded_cents IS DISTINCT FROM OLD.amount_refunded_cents
    )) THEN
      RAISE EXCEPTION 'SYSTEM_FIELD: payment-provider and refund fields are server-managed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_booking_payment_provider_fields ON public.bookings;
CREATE TRIGGER protect_booking_payment_provider_fields
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_payment_provider_fields();

REVOKE EXECUTE ON FUNCTION public.protect_booking_payment_provider_fields() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_customer_payment_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF (TG_OP = 'INSERT' AND NEW.stripe_customer_id IS NOT NULL) OR
       (TG_OP = 'UPDATE' AND NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id)
    THEN
      RAISE EXCEPTION 'SYSTEM_FIELD: payment-provider customer fields are server-managed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_customer_payment_provider_fields ON public.customers;
CREATE TRIGGER protect_customer_payment_provider_fields
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_customer_payment_provider_fields();

REVOKE EXECUTE ON FUNCTION public.protect_customer_payment_provider_fields() FROM PUBLIC, anon, authenticated;

-- Stripe webhook/server fulfilment is the only authority that may create or
-- alter the verified payment ledger. Owners retain read access to their rows.
DROP POLICY IF EXISTS "Owners can manage their business payments" ON public.payments;
REVOKE ALL PRIVILEGES ON TABLE public.payments FROM anon, authenticated;
GRANT SELECT ON public.payments TO authenticated;

-- These privileges are never needed by PostgREST clients and are not governed
-- by RLS in the same way as ordinary row reads/writes. Remove them globally.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Future functions are private by default. Every callable RPC must be granted
-- deliberately in its own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
