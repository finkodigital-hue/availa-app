-- Public discovery uses deliberately narrow views; tenant tables are private.
-- Keep the existing owner, employee and expressly linked-professional policies.
revoke select on public.blocked_dates from anon;
grant select (id,business_id,staff_id,starts_at,ends_at,kind) on public.blocked_dates to anon;
drop policy if exists "authed reads blocked times" on public.blocked_dates;
drop policy if exists "authed reads bookable staff" on public.staff;
drop policy if exists "authenticated can view available businesses" on public.businesses;
drop policy if exists "public can view active businesses authed" on public.businesses;
drop policy if exists "public reads businesses for booking" on public.businesses;
create policy "employees read their business" on public.businesses for select to authenticated
using (public.is_business_member(id));

-- A signed-in stranger is not an internal booking operator.
drop policy if exists "authed can insert bookings" on public.bookings;
drop policy if exists "public can insert customers for booking" on public.customers;

-- This projection has no private notes. It must also work for signed-in
-- customers who have no base-table access to the salon's diary.
create or replace view public.blocked_dates_public
with (security_invoker=false, security_barrier=true) as
select d.id,d.business_id,d.staff_id,d.starts_at,d.ends_at,d.kind
from public.blocked_dates d join public.businesses b on b.id=d.business_id
where b.deletion_requested_at is null;

create or replace view public.public_businesses
with (security_invoker=false, security_barrier=true) as
select id,name,slug,logo_url,description,address,phone,email,website,timezone,
instagram,facebook,twitter,tiktok,cover_image_url,welcome_message,
booking_instructions,cancellation_policy,terms,faq,show_prices,show_staff,
show_durations,emergency_message,emergency_active,custom_domain,favicon_url,
browser_title,currency,hide_powered_by,deposit_percent,payment_mode,
cancellation_window_hours,page_theme,reminder_hours_before
from public.businesses where deletion_requested_at is null;

create or replace view public.public_staff
with (security_invoker=false, security_barrier=true) as
select s.id,s.business_id,s.name,s.role,s.photo_url,s.bio,s.bookable,s.active
from public.staff s join public.businesses b on b.id=s.business_id
where s.bookable and s.active and b.deletion_requested_at is null;
grant select on public.public_businesses,public.public_staff,public.blocked_dates_public to anon,authenticated;

-- Optional MFA is enforced for accounts that enrolled it, including direct
-- PostgREST/RPC calls. RLS also protects Storage and other table access.
create or replace function public.session_has_required_assurance()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select coalesce(auth.role(),'') <> 'authenticated' or (
    exists(select 1 from auth.users u where u.id=auth.uid()
      and (u.email is null or u.email_confirmed_at is not null))
    and (coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(
      select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified'
    ))
  );
$$;
revoke all on function public.session_has_required_assurance() from public;
grant execute on function public.session_has_required_assurance() to anon,authenticated,service_role;

create or replace function public.check_request_assurance()
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not public.session_has_required_assurance() then
    raise sqlstate '42501' using message='Email or two-factor verification required';
  end if;
end $$;
revoke all on function public.check_request_assurance() from public;
grant execute on function public.check_request_assurance() to anon,authenticated,service_role;

do $$ declare t record; begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and c.relrowsecurity and
      (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('create policy "require verified session" on %I.%I as restrictive for all to authenticated using ((select public.session_has_required_assurance())) with check ((select public.session_has_required_assurance()))',t.nspname,t.relname);
  end loop;
end $$;

-- Fail rather than replace an unrelated installation's pre-request hook.
do $$ declare existing text; begin
  select split_part(setting,'=',2) into existing
  from pg_roles r, unnest(r.rolconfig) setting
  where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
  if existing is not null and existing <> 'public.check_request_assurance' then
    raise exception 'Review existing PostgREST hook before installing assurance check';
  end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.check_request_assurance';
notify pgrst,'reload config';
notify pgrst,'reload schema';
