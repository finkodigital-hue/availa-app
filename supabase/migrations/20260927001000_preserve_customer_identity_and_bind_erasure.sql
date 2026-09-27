-- Keep portal ownership stable even if an Auth identity is removed outside the
-- application.  ON DELETE SET NULL made old customer records claimable by a
-- later, unrelated Auth account that happened to verify the same email address.
-- The UUID is an opaque historical binding; retaining it prevents that replay.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.conrelid = 'public.customers'::regclass
      and c.confrelid = 'auth.users'::regclass
      and a.attname = 'auth_user_id'
  loop
    execute format(
      'alter table public.customers drop constraint %I',
      v_constraint
    );
  end loop;
end;
$$;

comment on column public.customers.auth_user_id is
  'Immutable historical Auth UUID used for portal ownership. Deliberately has no auth.users FK so deleting an Auth account cannot make old records claimable by a new account with the same email.';

-- Owners can edit customer contact details, but the portal identity is set only
-- by the verified-email SECURITY DEFINER claim function or trusted server work.
-- SECURITY INVOKER is deliberate: current_user remains the function owner when
-- claim_current_customer_records performs its trusted nested update, while a
-- direct PostgREST table update runs as authenticated and is rejected.
create or replace function public.protect_customer_portal_identity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'SYSTEM_FIELD: customer portal identity is server-managed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_customer_portal_identity on public.customers;
create trigger protect_customer_portal_identity
before update of auth_user_id on public.customers
for each row execute function public.protect_customer_portal_identity();

revoke all on function public.protect_customer_portal_identity()
  from public, anon, authenticated;

-- Bind an erasure to the exact pending deletion request inside the same locked
-- transaction as anonymisation.  The browser/server preflight remains useful
-- for friendly errors, but it is not the authoritative integrity boundary.
create or replace function public.erase_customer_with_storage_job(
  p_business_id uuid,
  p_customer_id uuid,
  p_request_id uuid,
  p_resolved_by uuid,
  p_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_request public.customer_data_requests%rowtype;
  v_result jsonb;
  v_customer_name text;
  v_notifications_deleted integer := 0;
begin
  select * into v_request
  from public.customer_data_requests
  where id = p_request_id
  for update;

  if not found
     or v_request.business_id is distinct from p_business_id
     or v_request.customer_id is distinct from p_customer_id
     or v_request.kind <> 'deletion'
     or v_request.status <> 'pending' then
    raise exception 'Deletion request is not pending for this customer';
  end if;

  select name into v_customer_name
  from public.customers
  where id = p_customer_id and business_id = p_business_id;

  v_result := public.erase_customer(
    p_business_id, p_customer_id, p_request_id, p_resolved_by
  );

  -- The original erasure function removes booking-created/cancelled feed
  -- entries. Payment-failure entries also contain the customer's name and
  -- must not survive the same completed erasure.
  if nullif(v_customer_name, '') is not null then
    with deleted as (
      delete from public.notifications
      where business_id = p_business_id
        and title = 'Payment failed: ' || v_customer_name
      returning 1
    )
    select count(*) into v_notifications_deleted from deleted;
  end if;

  v_result := jsonb_set(
    v_result,
    '{notifications_deleted}',
    to_jsonb(coalesce((v_result->>'notifications_deleted')::integer, 0) + v_notifications_deleted)
  );

  insert into public.customer_erasure_storage_jobs(
    request_id, business_id, paths, status, completed_at
  ) values (
    p_request_id, p_business_id, coalesce(p_paths, '{}'),
    case when cardinality(coalesce(p_paths, '{}')) = 0 then 'completed' else 'pending' end,
    case when cardinality(coalesce(p_paths, '{}')) = 0 then now() else null end
  )
  on conflict(request_id) do nothing;

  return v_result;
end;
$$;

revoke all on function public.erase_customer_with_storage_job(uuid,uuid,uuid,uuid,text[])
  from public, anon, authenticated;
grant execute on function public.erase_customer_with_storage_job(uuid,uuid,uuid,uuid,text[])
  to service_role;

-- The base primitive has no request binding. Keep it callable only by its
-- owner so application service-role clients must use the checked wrapper.
revoke execute on function public.erase_customer(uuid,uuid,uuid,uuid)
  from service_role;

notify pgrst, 'reload schema';
