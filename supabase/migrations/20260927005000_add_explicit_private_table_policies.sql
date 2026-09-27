-- These tables are intentionally server-managed and already revoke every
-- client grant.  Explicit deny policies make that boundary visible to schema
-- inspection (and the Supabase adviser) instead of relying on the absence of
-- a permissive policy as an implicit deny.

drop policy if exists "server managed only" on public.booking_sources;
create policy "server managed only" on public.booking_sources
  as restrictive for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "server managed only" on public.business_signup_entitlements;
create policy "server managed only" on public.business_signup_entitlements
  as restrictive for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "server managed only" on public.operational_job_heartbeats;
create policy "server managed only" on public.operational_job_heartbeats
  as restrictive for all to anon, authenticated
  using (false)
  with check (false);

-- Historical default grants left the deliberately narrow public projections
-- writable according to the catalogue.  Views are presently non-updatable,
-- but the privilege should still express the read-only contract so a future
-- view rewrite cannot silently turn an inherited write grant into access.
revoke all privileges on table public.blocked_dates_public
  from public, anon, authenticated;
revoke all privileges on table public.public_businesses
  from public, anon, authenticated;
revoke all privileges on table public.public_staff
  from public, anon, authenticated;
revoke all privileges on table public.public_booking_slots
  from public, anon, authenticated;
grant select on table public.blocked_dates_public,
  public.public_businesses,
  public.public_staff,
  public.public_booking_slots
  to anon, authenticated, service_role;

-- This public-booking lookup intentionally exposes only three display fields,
-- but its first migration retained PostgreSQL's default EXECUTE grant to the
-- pseudo-role PUBLIC.  Name every runtime role explicitly so later roles do
-- not inherit access by accident.
revoke all privileges on function public.get_public_salon_professionals(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_salon_professionals(uuid)
  to anon, authenticated, service_role;

-- Public mutations go through allowlisted RPCs or server routes, which apply
-- validation, rate limits and authoritative pricing.  Remove legacy direct
-- table-write privileges even where RLS already happens to reject the write.
-- This leaves public SELECT grants untouched for the booking storefront.
revoke insert, update, delete on all tables in schema public from anon;
alter default privileges in schema public
  revoke insert, update, delete on tables from anon;

notify pgrst, 'reload schema';
