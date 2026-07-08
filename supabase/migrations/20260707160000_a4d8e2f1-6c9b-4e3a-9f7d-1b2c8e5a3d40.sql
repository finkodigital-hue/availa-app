
-- Fix a pre-existing bug (not introduced this session, but discovered while
-- testing the public-booking-for-pros flow end to end): anonymous public
-- bookings have been completely broken since migration 20260704200212.
--
-- That migration removed the anon SELECT policy on the raw `staff` table
-- when it introduced the `public_staff` view for safe client-side display,
-- but never restored an equivalent policy. The client's own reads go
-- through `public_staff` (fine), but `create_public_booking` does its own
-- internal validation directly against the raw `staff` table — and with no
-- anon SELECT policy left on it at all, that check
-- (`SELECT 1 FROM staff WHERE id = p_staff_id AND business_id = p_business_id`)
-- always returned zero rows, so every anonymous booking failed with
-- "Invalid staff for this business", for every business (not just linked
-- pros — this affects a salon's own staff too).
--
-- Fix properly this time: revoke the old full-column anon grant (it was
-- never actually revoked when 200212 added the column-scoped grant, so it
-- was still silently in effect) and replace it with a column-scoped grant
-- restricted to the same safe columns as `public_staff`, plus a row policy
-- limited to bookable/active staff. This keeps the email/phone hardening
-- 200212 intended while restoring anon's ability to read the columns
-- create_public_booking actually needs.
REVOKE SELECT ON public.staff FROM anon;
GRANT SELECT (id, business_id, name, role, photo_url, bio, bookable, active)
  ON public.staff TO anon;

CREATE POLICY "public reads bookable staff for booking" ON public.staff
  FOR SELECT TO anon
  USING (bookable = true AND active = true);
