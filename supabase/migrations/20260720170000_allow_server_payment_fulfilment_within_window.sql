-- The cancellation window protects customer self-service changes, but payment
-- fulfilment runs through the server using the service role and must always be
-- allowed to record a Stripe payment that already succeeded.
CREATE OR REPLACE FUNCTION public.enforce_booking_change_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  win int;
BEGIN
  IF auth.role() = 'service_role' OR public.is_business_owner(NEW.business_id) THEN
    RETURN NEW;
  END IF;
  SELECT cancellation_window_hours INTO win FROM public.businesses WHERE id = NEW.business_id;
  IF OLD.starts_at < (now() + make_interval(hours => COALESCE(win, 24))) THEN
    RAISE EXCEPTION 'This booking is within the % hour cancellation window and can no longer be changed online. Please contact the business.', COALESCE(win, 24);
  END IF;
  RETURN NEW;
END $$;
