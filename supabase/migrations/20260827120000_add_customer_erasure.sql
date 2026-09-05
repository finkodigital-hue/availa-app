-- GDPR export/erasure fulfilment. Export needs no new DB function (owners
-- already have SELECT on their own customers/bookings/payments via
-- existing RLS) — this migration is entirely for erasure, plus one column
-- shared by both features to record who fulfilled a request and when.
--
-- Design notes (see conversation): erasure anonymises in place rather than
-- deleting rows — bookings/payments are kept (UK financial record
-- retention) with identity fields stripped. The portal auth account is
-- shared across every business a customer has ever booked with (see
-- get_portal_customer_records), so it is only removed if no OTHER
-- business still holds a live (non-null-email) customers row for that
-- email — otherwise removing it would sign someone out of unrelated
-- salons that never asked for their data to be erased. That check reads
-- auth.users, so it and the account removal itself happen from the
-- calling server function via the Admin API, not from SQL.
--
-- Four PII locations found in the Step 1 inventory are NOT auto-scrubbed
-- by this function, on purpose: page-builder testimonial blocks and their
-- history in page_edit_history (free text, no link to a customer row),
-- and reminder_send_failures / client_errors error text (may echo an
-- email back from a provider error, not a structured field). The caller
-- surfaces these as a manual-check notice rather than silently omitting
-- them.

ALTER TABLE public.customer_data_requests
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id);

-- Used only by the erasure server function to decide whether the shared
-- portal auth account is safe to remove. Read-only, and only ever called
-- with an email already confirmed to belong to the customer being erased
-- — never exposed to authenticated/anon.
CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.erase_customer(
  p_business_id uuid,
  p_customer_id uuid,
  p_request_id uuid,
  p_resolved_by uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
  v_email text;
  v_upcoming_count integer;
  v_bookings_scrubbed integer;
  v_payments_scrubbed integer;
  v_notifications_deleted integer;
  v_other_business_has_live_email boolean;
BEGIN
  SELECT name, email INTO v_name, v_email
  FROM customers
  WHERE id = p_customer_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  SELECT count(*) INTO v_upcoming_count
  FROM bookings
  WHERE customer_id = p_customer_id AND status <> 'cancelled' AND starts_at > now();
  IF v_upcoming_count > 0 THEN
    RAISE EXCEPTION 'UPCOMING_BOOKINGS:%', v_upcoming_count;
  END IF;

  v_other_business_has_live_email := v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM customers
    WHERE lower(email) = lower(v_email) AND business_id <> p_business_id AND email IS NOT NULL
  );

  -- notifications carry no customer_id/booking_id FK at all (see inventory)
  -- — the title is the only signal, so this is a best-effort, business- and
  -- prefix-scoped substring match rather than an exact one. Deleted outright
  -- rather than edited: notifications have no retention requirement, and
  -- editing text in place risks leaving a partially-scrubbed fragment.
  IF v_name IS NOT NULL AND v_name <> '' THEN
    WITH deleted AS (
      DELETE FROM notifications
      WHERE business_id = p_business_id
        AND (title = 'New booking: ' || v_name OR title = 'Booking cancelled: ' || v_name)
      RETURNING 1
    )
    SELECT count(*) INTO v_notifications_deleted FROM deleted;
  ELSE
    v_notifications_deleted := 0;
  END IF;

  WITH scrubbed AS (
    UPDATE bookings
    SET customer_name = 'Deleted customer', customer_email = NULL, customer_phone = NULL, notes = NULL
    WHERE customer_id = p_customer_id
    RETURNING id
  )
  SELECT count(*) INTO v_bookings_scrubbed FROM scrubbed;

  WITH scrubbed AS (
    UPDATE payments
    SET customer_name = 'Deleted customer', customer_email = NULL
    WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = p_customer_id)
    RETURNING id
  )
  SELECT count(*) INTO v_payments_scrubbed FROM scrubbed;

  UPDATE customers
  SET name = 'Deleted customer',
      email = NULL,
      phone = NULL,
      address = NULL,
      notes = NULL,
      avatar_url = NULL,
      auth_user_id = NULL,
      stripe_customer_id = NULL,
      external_id = NULL
  WHERE id = p_customer_id;

  UPDATE customer_data_requests
  SET status = 'completed', resolved_at = now(), resolved_by = p_resolved_by
  WHERE id = p_request_id AND business_id = p_business_id;

  RETURN jsonb_build_object(
    'bookings_scrubbed', v_bookings_scrubbed,
    'payments_scrubbed', v_payments_scrubbed,
    'notifications_deleted', v_notifications_deleted,
    'other_business_has_live_email', v_other_business_has_live_email,
    'had_email', v_email IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erase_customer(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_customer(uuid,uuid,uuid,uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_customer(uuid,uuid,uuid,uuid) TO service_role;
