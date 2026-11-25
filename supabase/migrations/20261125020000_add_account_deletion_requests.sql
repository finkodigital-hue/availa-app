-- A private review queue, not an Auth deletion operation. Keep the audit/receipt
-- rows if Auth is later removed by the separately authorised operator process.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  contact_email text not null check (length(contact_email) between 3 and 320),
  status text not null default 'requested'
    check (status in ('requested', 'in_review', 'cancelled', 'completed')),
  requested_at timestamptz not null default statement_timestamp(),
  review_due_at timestamptz not null default statement_timestamp() + interval '24 hours',
  completion_target_at timestamptz not null default statement_timestamp() + interval '720 hours',
  review_started_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  confirmation_sent_at timestamptz,
  status_message text,
  retained_data_summary text,
  operator_reference text,
  unique (id, user_id),
  constraint account_deletion_due_times check (
    review_due_at = requested_at + interval '24 hours'
    and completion_target_at = requested_at + interval '720 hours'
  ),
  constraint account_deletion_state_times check (
    (status = 'requested' and review_started_at is null and cancelled_at is null and completed_at is null)
    or (status = 'in_review' and review_started_at is not null and cancelled_at is null and completed_at is null)
    or (status = 'cancelled' and review_started_at is null and cancelled_at is not null and completed_at is null)
    or (status = 'completed' and review_started_at is not null and cancelled_at is null and completed_at is not null)
  ),
  constraint account_deletion_time_order check (
    (review_started_at is null or review_started_at >= requested_at)
    and (cancelled_at is null or cancelled_at >= requested_at)
    and (completed_at is null or completed_at >= review_started_at)
    and (confirmation_sent_at is null or confirmation_sent_at >= requested_at)
  ),
  -- This is the completion confirmation, not an initial acknowledgement.
  -- Operators record completed only after actual work and confirmation evidence.
  constraint account_deletion_completion_evidence check (
    (status <> 'completed' and confirmation_sent_at is null)
    or (status = 'completed' and confirmation_sent_at is not null
      and confirmation_sent_at >= completed_at
      and operator_reference is not null and length(btrim(operator_reference)) > 0)
  )
);
create unique index account_deletion_one_active_per_user
  on public.account_deletion_requests(user_id) where status in ('requested', 'in_review');
create index account_deletion_latest_per_user
  on public.account_deletion_requests(user_id, requested_at desc, id desc);
create index account_deletion_pending_review
  on public.account_deletion_requests(review_due_at) where status = 'requested';

-- Every request key is a permanent receipt for its original request, including
-- aliases submitted while a request is already active. Cancellation never clears it.
create table public.account_deletion_request_keys (
  user_id uuid not null,
  request_key uuid not null,
  request_id uuid not null,
  primary key (user_id, request_key),
  foreign key (request_id, user_id)
    references public.account_deletion_requests(id, user_id) on delete restrict
);
alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_request_keys enable row level security;
create policy account_deletion_requests_server_only on public.account_deletion_requests
  for all to anon, authenticated using (false) with check (false);
create policy account_deletion_request_keys_server_only on public.account_deletion_request_keys
  for all to anon, authenticated using (false) with check (false);
revoke all on public.account_deletion_requests from public, anon, authenticated, service_role;
revoke all on public.account_deletion_request_keys from public, anon, authenticated, service_role;
-- The protected operator/monitor can read the queue and record review/receipt
-- outcomes. New requests and idempotency receipts are written only by the RPCs.
grant select, update on public.account_deletion_requests to service_role;

create function public._account_deletion_request_status(p_request public.account_deletion_requests)
returns jsonb language sql stable set search_path = pg_catalog, pg_temp as $$
  select case when p_request.id is null then null else jsonb_build_object(
    'id', p_request.id,
    'status', p_request.status,
    'requested_at', p_request.requested_at,
    'review_due_at', p_request.review_due_at,
    'completion_target_at', p_request.completion_target_at,
    'review_started_at', p_request.review_started_at,
    'cancelled_at', p_request.cancelled_at,
    'completed_at', p_request.completed_at,
    'confirmation_sent_at', p_request.confirmation_sent_at,
    'status_message', p_request.status_message,
    'retained_data_summary', p_request.retained_data_summary
  ) end;
$$;
revoke all on function public._account_deletion_request_status(public.account_deletion_requests)
  from public, anon, authenticated, service_role;

create function public.request_account_deletion_server(
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
      p_user_id, v_user.email, v_now, v_now + interval '24 hours', v_now + interval '720 hours'
    ) returning * into v_request;
  end if;
  insert into public.account_deletion_request_keys(user_id, request_key, request_id)
    values (p_user_id, p_request_key, v_request.id);
  return public._account_deletion_request_status(v_request);
end;
$$;

create function public.cancel_account_deletion_request_server(p_user_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_user record;
  v_request public.account_deletion_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server access required' using errcode = '42501';
  end if;
  if p_user_id is null or p_request_id is null then
    raise exception 'Invalid account deletion request' using errcode = '22023';
  end if;
  select u.email, u.email_confirmed_at, u.banned_until, u.deleted_at into v_user
    from auth.users u where u.id = p_user_id for update;
  if not found or v_user.email is null or v_user.email_confirmed_at is null
     or v_user.deleted_at is not null or v_user.banned_until > clock_timestamp() then
    raise exception 'Account could not be verified' using errcode = '22023';
  end if;
  -- Row locking rechecks the operator's committed status before cancellation.
  select r.* into v_request from public.account_deletion_requests r
    where r.id = p_request_id and r.user_id = p_user_id for update;
  if not found then
    raise exception 'Deletion request is no longer available. Please refresh.' using errcode = '22023';
  end if;
  if v_request.status = 'cancelled' then
    return public._account_deletion_request_status(v_request);
  end if;
  if v_request.status <> 'requested' then
    raise exception 'Deletion processing has started. Contact support if you need to change your request.' using errcode = '22023';
  end if;
  update public.account_deletion_requests
    set status = 'cancelled', cancelled_at = clock_timestamp()
    where id = v_request.id and user_id = p_user_id
    returning * into v_request;
  return public._account_deletion_request_status(v_request);
end;
$$;

create function public.get_account_deletion_status_server(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_request public.account_deletion_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server access required' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id and u.email is not null
      and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
  ) then
    raise exception 'Account could not be verified' using errcode = '22023';
  end if;
  select r.* into v_request from public.account_deletion_requests r
    where r.user_id = p_user_id order by r.requested_at desc, r.id desc limit 1;
  return public._account_deletion_request_status(v_request);
end;
$$;

revoke all on function public.request_account_deletion_server(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_account_deletion_request_server(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_account_deletion_status_server(uuid) from public, anon, authenticated;
grant execute on function public.request_account_deletion_server(uuid, text, uuid) to service_role;
grant execute on function public.cancel_account_deletion_request_server(uuid, uuid) to service_role;
grant execute on function public.get_account_deletion_status_server(uuid) to service_role;
