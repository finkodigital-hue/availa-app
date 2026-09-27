-- A previously issued JWT must stop working when Supabase Auth bans or deletes
-- the account, even before that token naturally expires.
create or replace function public.session_has_required_assurance()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.role(),'') <> 'authenticated' or (
    exists(
      select 1
      from auth.users u
      where u.id = auth.uid()
        and (u.email is null or u.email_confirmed_at is not null)
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())
    )
    and (
      coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
      or not exists(
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
    )
  );
$$;

revoke all on function public.session_has_required_assurance() from public;
grant execute on function public.session_has_required_assurance()
to anon, authenticated, service_role;
