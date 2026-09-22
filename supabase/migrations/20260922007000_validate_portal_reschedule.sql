-- Apply public scheduling rules to the authenticated customer portal too.
-- The invoker RPC retains RLS; its trigger may call the private validator.
CREATE OR REPLACE FUNCTION public.guard_customer_booking_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  validated_end timestamptz;
BEGIN
  -- Owners, linked professionals, service-role jobs, and server-side admin
  -- actions retain their existing write paths.  This guard only applies to a
  -- customer using the authenticated portal policy.
  IF auth.role() = 'authenticated'
    AND lower(OLD.customer_email) = public.current_user_email()
    AND NOT public.is_business_owner(OLD.business_id)
    AND NOT public.is_linked_pro_of(OLD.business_id)
  THEN
    IF current_setting('bookzenvo.customer_reschedule', true) = '1' THEN
      IF OLD.status <> 'confirmed' THEN
        RAISE EXCEPTION 'Only confirmed bookings can be rescheduled';
      END IF;
      validated_end := public.validate_public_booking_slot(
        OLD.business_id, OLD.service_id, OLD.staff_id, NEW.starts_at, OLD.id
      );
      IF validated_end IS DISTINCT FROM NEW.ends_at OR EXISTS (
        SELECT 1 FROM public.services WHERE id = OLD.service_id
          AND (gap_min IS DISTINCT FROM OLD.gap_min
            OR active_after_min IS DISTINCT FROM OLD.active_after_min)
      ) THEN
        RAISE EXCEPTION 'The service has changed; contact the business to reschedule';
      END IF;
      -- The reschedule RPC performs the conflict check and cancellation-window
      -- check before setting this transaction-local marker.  Only its two
      -- schedule columns may change through that path.
      IF (to_jsonb(NEW) - ARRAY['starts_at', 'ends_at', 'updated_at'])
           IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['starts_at', 'ends_at', 'updated_at']) THEN
        RAISE EXCEPTION 'Customers can only change booking time through reschedule';
      END IF;
    ELSE
      -- The direct portal action is cancellation.  Do not allow a customer to
      -- edit price, payment state, customer identity, notes, staff, service,
      -- or dates by adding fields to the update request.
      IF (to_jsonb(NEW) - ARRAY['status', 'updated_at'])
           IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
        RAISE EXCEPTION 'Customers can only change booking status';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
        RAISE EXCEPTION 'Customers can only cancel a booking';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_customer_booking_updates() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_customer_booking_updates ON public.bookings;
CREATE TRIGGER guard_customer_booking_updates
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_booking_updates();


notify pgrst,'reload schema';
