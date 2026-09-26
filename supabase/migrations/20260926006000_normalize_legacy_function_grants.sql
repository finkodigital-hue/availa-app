-- Production verification found two old helpers still carrying direct anon
-- grants even though their original migrations revoked PUBLIC, while the
-- token-gated professional invitation lookup had lost its intended anon
-- grant. Normalize all three explicitly so provider default privileges or
-- historical manual drift cannot decide the application boundary.

revoke execute on function public.is_linked_pro_of(uuid) from public, anon;
revoke execute on function public.merge_customers(uuid, uuid) from public, anon;
grant execute on function public.is_linked_pro_of(uuid) to authenticated, service_role;
grant execute on function public.merge_customers(uuid, uuid) to authenticated, service_role;

-- The production audit also found that this historical function was missing
-- even though its creating migration was recorded. Recreate the narrow,
-- token-gated projection before normalizing its grants. Every referenced
-- application object is schema-qualified and the runtime path contains only
-- pg_catalog plus pg_temp last.
create or replace function public.get_invitation_by_token(_token text)
returns table (
  id uuid,
  salon_business_id uuid,
  email text,
  chair_label text,
  rent_mode text,
  rent_amount_cents integer,
  commission_percent numeric,
  agreement_start date,
  agreement_end date,
  rent_due_day smallint,
  message text,
  expires_at timestamptz,
  salon_name text,
  salon_logo_url text
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select pi.id, pi.salon_business_id, pi.email, pi.chair_label, pi.rent_mode,
         pi.rent_amount_cents, pi.commission_percent, pi.agreement_start,
         pi.agreement_end, pi.rent_due_day, pi.message, pi.expires_at,
         b.name, b.logo_url
  from public.professional_invitations pi
  join public.businesses b on b.id = pi.salon_business_id
  where pi.token = _token
    and pi.status = 'pending'
    and pi.expires_at > now()
  limit 1;
$$;

revoke execute on function public.get_invitation_by_token(text) from public, anon, authenticated;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
