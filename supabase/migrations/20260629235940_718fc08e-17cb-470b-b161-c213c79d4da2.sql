
-- Add cancellation window to businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS cancellation_window_hours int NOT NULL DEFAULT 24;

-- Link customers to auth users when they verify their email
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customers_auth_user_id_idx ON public.customers(auth_user_id);
CREATE INDEX IF NOT EXISTS customers_email_lower_idx ON public.customers(lower(email));
CREATE INDEX IF NOT EXISTS bookings_customer_email_lower_idx ON public.bookings(lower(customer_email));

-- Helper to fetch current auth user's email
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;

-- RLS policies allowing the verified customer to access their bookings
CREATE POLICY "Customers can view their bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (lower(customer_email) = public.current_user_email());

CREATE POLICY "Customers can update their bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (lower(customer_email) = public.current_user_email())
  WITH CHECK (lower(customer_email) = public.current_user_email());

-- Customer record access
CREATE POLICY "Customers can view their own customer record"
  ON public.customers FOR SELECT TO authenticated
  USING (lower(email) = public.current_user_email());

CREATE POLICY "Customers can update their own customer record"
  ON public.customers FOR UPDATE TO authenticated
  USING (lower(email) = public.current_user_email())
  WITH CHECK (lower(email) = public.current_user_email());

-- Enforce cancellation window for customers (business owners bypass)
CREATE OR REPLACE FUNCTION public.enforce_booking_change_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  win int;
BEGIN
  IF public.is_business_owner(NEW.business_id) THEN
    RETURN NEW;
  END IF;
  SELECT cancellation_window_hours INTO win FROM public.businesses WHERE id = NEW.business_id;
  IF OLD.starts_at < (now() + make_interval(hours => COALESCE(win, 24))) THEN
    RAISE EXCEPTION 'This booking is within the % hour cancellation window and can no longer be changed online. Please contact the business.', COALESCE(win, 24);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_booking_window ON public.bookings;
CREATE TRIGGER enforce_booking_window
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_change_window();
