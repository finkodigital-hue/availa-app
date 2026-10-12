-- The conflict helper is deliberately hidden from anonymous callers, but the
-- signed-in calendar RPCs are SECURITY INVOKER and must be able to call it.
-- Migration 20260925001000 revoked authenticated EXECUTE after those RPCs had
-- already been created, causing owner-created bookings, reschedules and moves
-- to fail before their RLS-protected write. The helper reveals only the same
-- occupied-slot result already published by public_booking_slots and performs
-- no write, so signed-in access restores the intended permission boundary.
revoke all on function public.assert_no_booking_conflict(
  uuid,
  timestamptz,
  timestamptz,
  integer,
  integer,
  uuid
) from public, anon;

grant execute on function public.assert_no_booking_conflict(
  uuid,
  timestamptz,
  timestamptz,
  integer,
  integer,
  uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';
