-- This is an internal scheduling helper. Public booking writes go through the
-- server, and the public availability view supplies the storefront calendar.
-- Keep service_role access for server and database maintenance paths.
revoke all on function public.assert_no_booking_conflict(uuid,timestamptz,timestamptz,integer,integer,uuid)
  from public,anon,authenticated;
grant execute on function public.assert_no_booking_conflict(uuid,timestamptz,timestamptz,integer,integer,uuid)
  to service_role;
