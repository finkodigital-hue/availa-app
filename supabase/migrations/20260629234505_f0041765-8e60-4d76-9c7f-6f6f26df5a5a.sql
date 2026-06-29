
-- Businesses: Stripe Connect + payment policy
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'none' CHECK (payment_mode IN ('none','deposit','full')),
  ADD COLUMN IF NOT EXISTS deposit_percent integer NOT NULL DEFAULT 30 CHECK (deposit_percent BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd';

-- Bookings: payment fields
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending','deposit_paid','paid','refunded','partially_refunded','failed')),
  ADD COLUMN IF NOT EXISTS amount_due_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_refunded_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text;

CREATE INDEX IF NOT EXISTS bookings_payment_intent_idx ON public.bookings(stripe_payment_intent_id);

-- Payments table: every charge / refund / failure
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  type text NOT NULL CHECK (type IN ('charge','refund','failure')),
  status text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  customer_name text,
  customer_email text,
  description text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their business payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (public.is_business_owner(business_id));

CREATE POLICY "Owners can manage their business payments"
  ON public.payments FOR ALL
  TO authenticated
  USING (public.is_business_owner(business_id))
  WITH CHECK (public.is_business_owner(business_id));

CREATE INDEX IF NOT EXISTS payments_business_idx ON public.payments(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_booking_idx ON public.payments(booking_id);

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
