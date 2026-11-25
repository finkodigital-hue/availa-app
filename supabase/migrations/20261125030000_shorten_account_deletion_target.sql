-- An earlier operational escalation target, not a statutory-deadline calculator.
-- Keep 20261125020000 immutable: it has already been applied in production.
alter table public.account_deletion_requests
  drop constraint account_deletion_due_times;

alter table public.account_deletion_requests
  alter column completion_target_at set default statement_timestamp() + interval '648 hours';

-- Bring open work forward. Preserve completed/cancelled receipts and all other
-- fields, identities, review dates, request keys and operator evidence.
update public.account_deletion_requests
  set completion_target_at = requested_at + interval '648 hours'
  where status in ('requested', 'in_review')
    and completion_target_at <> requested_at + interval '648 hours';

alter table public.account_deletion_requests
  add constraint account_deletion_due_times check (
    review_due_at = requested_at + interval '24 hours'
    and (
      completion_target_at = requested_at + interval '648 hours'
      or (status in ('cancelled', 'completed')
        and completion_target_at = requested_at + interval '720 hours')
    )
  );

-- CREATE OR REPLACE preserves the existing service-only execution grants.
-- The identity/row locks and durable request-key handling are unchanged.
create or replace function public.request_account_deletion_server(
  p_user_id uuid, p_contact_email text, p_request_key uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_user record;
  v_request public.account_deletion_requests%rowtype;
  v_now timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server access required' using errcode = '42501';
  end if;
  if p_user_id is null or p_request_key is null or p_contact_email is null
     or length(btrim(p_contact_email)) not between 3 and 320
     or p_contact_email ~ '[[:cntrl:]]' then
    raise exception 'Invalid account deletion request' using errcode = '22023';
  end if;
  -- Serialize both request and cancellation on the real current Auth identity.
  -- This also conflicts with an operator deleting/updating that Auth row.
  select u.email, u.email_confirmed_at, u.banned_until, u.deleted_at into v_user
    from auth.users u where u.id = p_user_id for update;
  if not found or v_user.email_confirmed_at is null or v_user.deleted_at is not null
     or v_user.banned_until > clock_timestamp() or v_user.email is null
     or lower(btrim(v_user.email)) <> lower(btrim(p_contact_email)) then
    raise exception 'Account could not be verified' using errcode = '22023';
  end if;

  select r.* into v_request from public.account_deletion_request_keys k
    join public.account_deletion_requests r on r.id = k.request_id and r.user_id = k.user_id
    where k.user_id = p_user_id and k.request_key = p_request_key for update of r;
  if found then return public._account_deletion_request_status(v_request); end if;

  select r.* into v_request from public.account_deletion_requests r
    where r.user_id = p_user_id and r.status in ('requested', 'in_review') for update;
  if not found then
    v_now := clock_timestamp();
    insert into public.account_deletion_requests(
      user_id, contact_email, requested_at, review_due_at, completion_target_at
    ) values (
      p_user_id, v_user.email, v_now, v_now + interval '24 hours', v_now + interval '648 hours'
    ) returning * into v_request;
  end if;
  insert into public.account_deletion_request_keys(user_id, request_key, request_id)
    values (p_user_id, p_request_key, v_request.id);
  return public._account_deletion_request_status(v_request);
end;
$$;

