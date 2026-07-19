-- Public bookings must go through create_public_booking(), which validates
-- the booking and applies the rate limits. Anonymous users must not be able
-- to insert directly into bookings and bypass that function.
--
-- The RPC runs as SECURITY DEFINER (see 20260719120000), so this does not
-- affect normal public booking-page submissions. Authenticated dashboard
-- users retain their separate INSERT policy and privilege.

REVOKE INSERT ON public.bookings FROM anon;
DROP POLICY IF EXISTS "public can insert bookings" ON public.bookings;
