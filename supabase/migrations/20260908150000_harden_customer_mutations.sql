-- Customer-facing update policies intentionally allow a signed-in customer to
-- update rows that match their verified email.  Keep those policies useful for
-- the portal while preventing a client from changing ownership, payment,
-- schedule, or internal notes by sending a wider update payload directly to
-- PostgREST.

CREATE OR REPLACE FUNCTION public.guard_customer_booking_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

CREATE OR REPLACE FUNCTION public.guard_customer_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated'
    AND lower(OLD.email) = public.current_user_email()
    AND NOT public.is_business_owner(OLD.business_id)
  THEN
    -- The portal profile intentionally edits only the display name and phone.
    -- In particular, business_id, email, notes, and auth linkage must remain
    -- controlled by the business/server side.
    IF (to_jsonb(NEW) - ARRAY['name', 'phone', 'updated_at'])
         IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['name', 'phone', 'updated_at']) THEN
      RAISE EXCEPTION 'Customers can only change their name or phone number';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_customer_profile_updates() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_customer_profile_updates ON public.customers;
CREATE TRIGGER guard_customer_profile_updates
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_profile_updates();

-- Mark the validated portal reschedule path for the booking guard above.  The
-- setting is local to the current transaction and cannot be supplied by a
-- client as an HTTP parameter.
CREATE OR REPLACE FUNCTION public.reschedule_booking(
  p_booking_id uuid, p_new_starts_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_duration interval;
  v_gap_min integer;
  v_active_after_min integer;
  v_new_ends_at timestamptz;
BEGIN
  SELECT staff_id, ends_at - starts_at, gap_min, active_after_min
    INTO v_staff_id, v_duration, v_gap_min, v_active_after_min
  FROM bookings
  WHERE id = p_booking_id;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  v_new_ends_at := p_new_starts_at + v_duration;

  PERFORM public.assert_no_booking_conflict(
    v_staff_id, p_new_starts_at, v_new_ends_at, v_gap_min, v_active_after_min, p_booking_id
  );

  PERFORM set_config('bookzenvo.customer_reschedule', '1', true);
  UPDATE bookings
  SET starts_at = p_new_starts_at, ends_at = v_new_ends_at
  WHERE id = p_booking_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) TO authenticated;
