-- Paperless salon consultations and patch-test records.
--
-- Health and allergy answers are special-category personal data. They are
-- deliberately isolated from the general customers table, readable only by
-- the owning salon through the Bookzenvo server boundary. The client reviews
-- and signs the record in person on the salon's device. A signed snapshot is immutable so later edits to
-- a template cannot change what the customer agreed to.

create extension if not exists pgcrypto with schema extensions;

create table public.consultation_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  kind text not null default 'consultation'
    check (kind in ('consultation', 'patch_test')),
  questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array'),
  consent_text text not null check (char_length(consent_text) between 20 and 4000),
  validity_days integer not null default 365 check (validity_days between 1 and 3650),
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultation_templates_business_idx
  on public.consultation_templates (business_id, active, created_at desc);

create trigger trg_consultation_templates_updated
  before update on public.consultation_templates
  for each row execute function public.set_updated_at();

create table public.consultation_template_services (
  template_id uuid not null references public.consultation_templates(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (template_id, service_id)
);

create index consultation_template_services_service_idx
  on public.consultation_template_services (service_id);

create table public.consultation_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  template_id uuid references public.consultation_templates(id) on delete set null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'signed', 'withdrawn', 'expired')),
  template_version integer,
  template_snapshot jsonb,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  explicit_health_consent boolean not null default false,
  signer_name text,
  signature_data text,
  signed_at timestamptz,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  evidence_hash text,
  patch_test_outcome text check (patch_test_outcome in ('passed', 'failed', 'retest_required')),
  patch_tested_at timestamptz,
  patch_tested_by text,
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (signature_data is null or octet_length(signature_data) <= 200000),
  check (patch_tested_by is null or char_length(patch_tested_by) <= 150),
  check (staff_notes is null or char_length(staff_notes) <= 2000),
  check (
    status not in ('signed', 'withdrawn', 'expired') or
    (template_snapshot is not null and template_version is not null and
     explicit_health_consent and signer_name is not null and
     signature_data is not null and signed_at is not null and evidence_hash is not null)
  )
);

create index consultation_submissions_business_idx
  on public.consultation_submissions (business_id, status, created_at desc);
create index consultation_submissions_customer_idx
  on public.consultation_submissions (customer_id, status, created_at desc);
create index consultation_submissions_booking_idx
  on public.consultation_submissions (booking_id);
create unique index consultation_submissions_one_pending_idx
  on public.consultation_submissions (template_id, booking_id, customer_id)
  where status = 'pending';

create trigger trg_consultation_submissions_updated
  before update on public.consultation_submissions
  for each row execute function public.set_updated_at();

create table public.consultation_audit_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.consultation_submissions(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('requested', 'viewed', 'signed', 'withdrawn', 'expired', 'patch_test_recorded')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index consultation_audit_events_submission_idx
  on public.consultation_audit_events (submission_id, created_at);

-- Validate that a template can only be linked to a service in the same
-- business. This is enforced in PostgreSQL as well as the application.
create or replace function public.validate_consultation_template_service()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  template_business uuid;
  service_business uuid;
begin
  select business_id into template_business from consultation_templates where id = new.template_id;
  select business_id into service_business from services where id = new.service_id;
  if template_business is null or service_business is null or
     new.business_id <> template_business or new.business_id <> service_business then
    raise exception 'The consultation template and service must belong to the same business.';
  end if;
  return new;
end;
$$;

create trigger validate_consultation_template_service
  before insert or update on public.consultation_template_services
  for each row execute function public.validate_consultation_template_service();

-- Create a pending request whenever an appointment is made for a service with
-- a required form. This function is private because it is only a trigger.
create or replace function public.create_booking_consultation_requests()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.customer_id is null or new.service_id is null or new.status = 'cancelled' then
    delete from consultation_submissions
    where booking_id = new.id and status = 'pending';
    return new;
  end if;

  -- If the appointment's service changed, remove only unsigned requests that
  -- are no longer relevant. Signed evidence is always retained.
  delete from consultation_submissions cs
  where cs.booking_id = new.id
    and cs.status = 'pending'
    and not exists (
      select 1
      from consultation_template_services cts
      join consultation_templates ct on ct.id = cts.template_id
      where cts.template_id = cs.template_id
        and cts.service_id = new.service_id
        and cts.business_id = new.business_id
        and ct.active
    );

  insert into consultation_submissions (
    business_id, template_id, booking_id, customer_id, status
  )
  select cts.business_id, cts.template_id, new.id, new.customer_id, 'pending'
  from consultation_template_services cts
  join consultation_templates ct on ct.id = cts.template_id
  where cts.service_id = new.service_id
    and cts.business_id = new.business_id
    and ct.active
  on conflict do nothing;

  insert into consultation_audit_events (submission_id, business_id, action, metadata)
  select cs.id, cs.business_id, 'requested', jsonb_build_object('booking_id', new.id)
  from consultation_submissions cs
  where cs.booking_id = new.id
    and not exists (
      select 1 from consultation_audit_events cae
      where cae.submission_id = cs.id and cae.action = 'requested'
    );

  return new;
end;
$$;

create trigger create_booking_consultation_requests
  after insert or update of customer_id, service_id, status on public.bookings
  for each row execute function public.create_booking_consultation_requests();

-- Linking a template also covers already-booked future appointments.
create or replace function public.backfill_consultation_requests_for_service()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into consultation_submissions (
    business_id, template_id, booking_id, customer_id, status
  )
  select new.business_id, new.template_id, b.id, b.customer_id, 'pending'
  from bookings b
  join consultation_templates ct on ct.id = new.template_id
  where b.service_id = new.service_id
    and b.business_id = new.business_id
    and b.customer_id is not null
    and b.status <> 'cancelled'
    and b.starts_at >= now()
    and ct.active
  on conflict do nothing;

  insert into consultation_audit_events (submission_id, business_id, action, metadata)
  select cs.id, cs.business_id, 'requested', jsonb_build_object('booking_id', cs.booking_id, 'reason', 'service_assigned')
  from consultation_submissions cs
  join bookings b on b.id = cs.booking_id
  where cs.template_id = new.template_id
    and b.service_id = new.service_id
    and b.business_id = new.business_id
    and not exists (
      select 1 from consultation_audit_events cae
      where cae.submission_id = cs.id and cae.action = 'requested'
    );
  return new;
end;
$$;

create trigger backfill_consultation_requests_for_service
  after insert on public.consultation_template_services
  for each row execute function public.backfill_consultation_requests_for_service();

-- Removing a form from a service removes outstanding requests for that
-- pairing, while preserving every signed or withdrawn evidence record.
create or replace function public.remove_obsolete_consultation_requests()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from consultation_submissions cs
  using bookings b
  where cs.booking_id = b.id
    and cs.template_id = old.template_id
    and b.service_id = old.service_id
    and cs.status = 'pending';
  return old;
end;
$$;

create trigger remove_obsolete_consultation_requests
  after delete on public.consultation_template_services
  for each row execute function public.remove_obsolete_consultation_requests();

-- Once signed, the evidence itself cannot be changed. Status can later become
-- withdrawn or expired, but the signature, answers and signed wording remain
-- immutable throughout the record's life.
create or replace function public.protect_signed_consultation_evidence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.signed_at is not null and (
    new.template_version is distinct from old.template_version or
    new.template_snapshot is distinct from old.template_snapshot or
    new.answers is distinct from old.answers or
    new.explicit_health_consent is distinct from old.explicit_health_consent or
    new.signer_name is distinct from old.signer_name or
    new.signature_data is distinct from old.signature_data or
    new.signed_at is distinct from old.signed_at or
    new.expires_at is distinct from old.expires_at or
    new.evidence_hash is distinct from old.evidence_hash or
    new.patch_test_outcome is distinct from old.patch_test_outcome or
    new.patch_tested_at is distinct from old.patch_tested_at or
    new.patch_tested_by is distinct from old.patch_tested_by or
    new.staff_notes is distinct from old.staff_notes
  ) then
    raise exception 'Signed consultation evidence is immutable.';
  end if;
  return new;
end;
$$;

create trigger protect_signed_consultation_evidence
  before update on public.consultation_submissions
  for each row execute function public.protect_signed_consultation_evidence();

-- Expiry never overwrites old evidence. It creates a fresh pending request for
-- the same future appointment and keeps the expired signed version in history.
create or replace function public.renew_expired_consultation_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  replacement_id uuid;
begin
  if old.status = 'signed' and new.status = 'expired' then
    insert into consultation_audit_events (submission_id, business_id, action, metadata)
    values (new.id, new.business_id, 'expired', '{}'::jsonb);

    insert into consultation_submissions (
      business_id, template_id, booking_id, customer_id, status
    )
    select new.business_id, new.template_id, new.booking_id, new.customer_id, 'pending'
    from bookings b
    join consultation_templates ct on ct.id = new.template_id
    where b.id = new.booking_id
      and b.starts_at > now()
      and b.status not in ('cancelled', 'completed', 'no_show')
      and ct.active
    on conflict do nothing
    returning id into replacement_id;

    if replacement_id is not null then
      insert into consultation_audit_events (submission_id, business_id, action, metadata)
      values (replacement_id, new.business_id, 'requested', jsonb_build_object('reason', 'previous_form_expired'));
    end if;
  end if;
  return new;
end;
$$;

create trigger renew_expired_consultation_request
  after update of status on public.consultation_submissions
  for each row execute function public.renew_expired_consultation_request();

-- Server-only transactional writers keep each sensitive state change and its
-- audit event together. Application code verifies ownership before calling.
create or replace function public.sign_consultation_submission_server(
  p_submission_id uuid,
  p_template_version integer,
  p_template_snapshot jsonb,
  p_answers jsonb,
  p_signer_name text,
  p_signature_data text,
  p_signed_at timestamptz,
  p_expires_at timestamptz,
  p_evidence_hash text,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_business uuid;
begin
  update consultation_submissions
  set status = 'signed',
      template_version = p_template_version,
      template_snapshot = p_template_snapshot,
      answers = p_answers,
      explicit_health_consent = true,
      signer_name = p_signer_name,
      signature_data = p_signature_data,
      signed_at = p_signed_at,
      expires_at = p_expires_at,
      withdrawn_at = null,
      withdrawal_reason = null,
      evidence_hash = p_evidence_hash
  where id = p_submission_id and status = 'pending'
  returning business_id into target_business;

  if target_business is null then return false; end if;
  insert into consultation_audit_events (submission_id, business_id, actor_user_id, action, metadata)
  values (p_submission_id, target_business, p_actor_user_id, 'signed', jsonb_build_object('template_version', p_template_version));
  return true;
end;
$$;

create or replace function public.withdraw_consultation_submission_server(
  p_submission_id uuid,
  p_reason text,
  p_withdrawn_at timestamptz,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_business uuid;
begin
  update consultation_submissions
  set status = 'withdrawn', withdrawn_at = p_withdrawn_at, withdrawal_reason = p_reason
  where id = p_submission_id and status = 'signed'
  returning business_id into target_business;

  if target_business is null then return false; end if;
  insert into consultation_audit_events (submission_id, business_id, actor_user_id, action, metadata)
  values (p_submission_id, target_business, p_actor_user_id, 'withdrawn', '{}'::jsonb);
  return true;
end;
$$;

create or replace function public.record_patch_test_result_server(
  p_submission_id uuid,
  p_outcome text,
  p_tested_at timestamptz,
  p_tested_by text,
  p_notes text,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_business uuid;
begin
  update consultation_submissions
  set patch_test_outcome = p_outcome,
      patch_tested_at = p_tested_at,
      patch_tested_by = p_tested_by,
      staff_notes = p_notes
  where id = p_submission_id and status = 'pending'
  returning business_id into target_business;

  if target_business is null then return false; end if;
  insert into consultation_audit_events (submission_id, business_id, actor_user_id, action, metadata)
  values (p_submission_id, target_business, p_actor_user_id, 'patch_test_recorded', jsonb_build_object('outcome', p_outcome));
  return true;
end;
$$;

alter table public.consultation_templates enable row level security;
alter table public.consultation_template_services enable row level security;
alter table public.consultation_submissions enable row level security;
alter table public.consultation_audit_events enable row level security;

create policy "owners manage consultation templates"
  on public.consultation_templates for all to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "owners manage consultation service links"
  on public.consultation_template_services for all to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy "owners read consultation submissions"
  on public.consultation_submissions for select to authenticated
  using (public.is_business_owner(business_id));

create policy "owners read consultation audit events"
  on public.consultation_audit_events for select to authenticated
  using (public.is_business_owner(business_id));

revoke all on public.consultation_templates from anon, authenticated;
revoke all on public.consultation_template_services from anon, authenticated;
revoke all on public.consultation_submissions from anon, authenticated;
revoke all on public.consultation_audit_events from anon, authenticated;

-- These tables are intentionally server-only. The policies remain as defence
-- in depth, but browser sessions receive no table privileges. Every read and
-- write goes through an authenticated Bookzenvo server function.
grant all on public.consultation_templates to service_role;
grant all on public.consultation_template_services to service_role;
grant all on public.consultation_submissions to service_role;
grant all on public.consultation_audit_events to service_role;
grant usage, select on sequence public.consultation_audit_events_id_seq to service_role;
grant execute on function public.sign_consultation_submission_server(uuid, integer, jsonb, jsonb, text, text, timestamptz, timestamptz, text, uuid) to service_role;
grant execute on function public.withdraw_consultation_submission_server(uuid, text, timestamptz, uuid) to service_role;
grant execute on function public.record_patch_test_result_server(uuid, text, timestamptz, text, text, uuid) to service_role;

revoke execute on function public.validate_consultation_template_service() from public, anon, authenticated;
revoke execute on function public.create_booking_consultation_requests() from public, anon, authenticated;
revoke execute on function public.backfill_consultation_requests_for_service() from public, anon, authenticated;
revoke execute on function public.remove_obsolete_consultation_requests() from public, anon, authenticated;
revoke execute on function public.protect_signed_consultation_evidence() from public, anon, authenticated;
revoke execute on function public.renew_expired_consultation_request() from public, anon, authenticated;
revoke execute on function public.sign_consultation_submission_server(uuid, integer, jsonb, jsonb, text, text, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
revoke execute on function public.withdraw_consultation_submission_server(uuid, text, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.record_patch_test_result_server(uuid, text, timestamptz, text, text, uuid) from public, anon, authenticated;
