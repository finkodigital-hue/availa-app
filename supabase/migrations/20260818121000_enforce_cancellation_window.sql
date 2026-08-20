-- The customer portal's "you can't cancel within Nh of the appointment" rule
-- only lived in the browser (portal.bookings.tsx withinWindow()). The actual
-- cancel is a plain status UPDATE allowed by the "Customers can update their
-- bookings" RLS policy, so a customer could cancel inside the window by
-- calling the API directly. Enforce it in the database.
--
-- Who is allowed to cancel inside the window:
--   * the business owner (cancels on the customer's behalf all the time)
--   * a linked salon with booking rights over the pro's calendar
--   * server-side paths using the service role (email-token cancel links in
--     /api/booking-actions run through supabaseAdmin and apply their own
--     policy; auth.uid() is NULL there)
-- Everyone else — i.e. the portal customer, the only other principal whose
-- RLS lets the update through — is held to the business's window.

CREATE OR REPLACE FUNCTION public.enforce_cancellation_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_hours integer;
BEGIN
  -- Only the transition into 'cancelled' is policed.
  IF NEW.status IS DISTINCT FROM 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- No JWT context: service-role / server paths. Allowed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Business owner: allowed.
  IF EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.id = NEW.business_id AND b.owner_id = auth.uid()
  ) THEN
    RETURN NEW;
  END IF;

  -- Linked salon with booking rights over this pro's calendar: allowed.
  IF public.salon_pro_permission(NEW.business_id, 'salon_can_book_pros') THEN
    RETURN NEW;
  END IF;

  -- Anyone else (the portal customer) is bound by the window.
  SELECT cancellation_window_hours INTO v_window_hours
  FROM businesses WHERE id = NEW.business_id;

  IF OLD.starts_at - now() < make_interval(hours => coalesce(v_window_hours, 24)) THEN
    RAISE EXCEPTION 'CANCEL_WINDOW: this booking is inside the cancellation window — contact the business to cancel';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_cancellation_window ON public.bookings;
CREATE TRIGGER booking_cancellation_window
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cancellation_window();
