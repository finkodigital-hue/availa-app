-- Keep the pre-launch waitlist enforceable at the database boundary. Customer
-- and staff identities are valid authenticated users too, so the general
-- authenticated role must not be able to create a business directly.

create table if not exists public.business_signup_entitlements (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  note text
);

alter table public.business_signup_entitlements enable row level security;
revoke all on table public.business_signup_entitlements from public, anon, authenticated;
grant all on table public.business_signup_entitlements to service_role;

create table if not exists public.customer_erasure_storage_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.customer_data_requests(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  bucket text not null default 'business-assets' check (bucket = 'business-assets'),
  paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.customer_erasure_storage_jobs enable row level security;
revoke all on table public.customer_erasure_storage_jobs from public, anon, authenticated;
grant all on table public.customer_erasure_storage_jobs to service_role;

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
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.erase_customer(
    p_business_id, p_customer_id, p_request_id, p_resolved_by
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

revoke insert on table public.businesses from authenticated;

drop policy if exists "owner manages business" on public.businesses;
drop policy if exists "owner reads business" on public.businesses;
drop policy if exists "owner updates business" on public.businesses;
drop policy if exists "owner deletes business" on public.businesses;

create policy "owner reads business" on public.businesses
  for select to authenticated using (auth.uid() = owner_id);
create policy "owner updates business" on public.businesses
  for update to authenticated using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
create policy "owner deletes business" on public.businesses
  for delete to authenticated using (auth.uid() = owner_id);

create or replace function public.claim_approved_business_signup(
  p_name text,
  p_slug text,
  p_timezone text
)
returns table(id uuid, name text, slug text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_business public.businesses%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED: sign in to create a workspace';
  end if;

  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = v_user_id and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'VERIFIED_EMAIL_REQUIRED: verify your email before creating a workspace';
  end if;

  if exists (select 1 from public.businesses b where b.owner_id = v_user_id) then
    raise exception 'WORKSPACE_EXISTS: this account already owns a workspace';
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then
    raise exception 'INVALID_NAME: enter a business name between 2 and 120 characters';
  end if;
  if char_length(trim(coalesce(p_slug, ''))) not between 3 and 63
     or trim(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'INVALID_SLUG: choose a valid booking page address';
  end if;
  if not exists (select 1 from pg_timezone_names tz where tz.name = p_timezone) then
    raise exception 'INVALID_TIMEZONE: choose a recognised timezone';
  end if;

  perform 1
  from public.business_signup_entitlements e
  where e.email = v_email
    and e.claimed_at is null
    and (e.expires_at is null or e.expires_at > now())
  for update;

  if not found then
    raise exception 'INVITE_REQUIRED: business access is currently invite-only';
  end if;

  insert into public.businesses(owner_id, name, slug, timezone)
  values (v_user_id, trim(p_name), trim(p_slug), p_timezone)
  returning * into v_business;

  update public.business_signup_entitlements e
  set claimed_at = now(), claimed_by = v_user_id
  where e.email = v_email and e.claimed_at is null;

  return query select v_business.id, v_business.name, v_business.slug;
end;
$$;

revoke all on function public.claim_approved_business_signup(text,text,text)
  from public, anon;
grant execute on function public.claim_approved_business_signup(text,text,text)
  to authenticated;

-- A valid chair-rental invitation is itself an entitlement. Create the
-- professional's workspace and consume the invitation in one transaction so
-- a failure cannot leave an orphan workspace or a half-accepted link.
create or replace function public.accept_professional_invitation_with_workspace(
  p_token text,
  p_business_name text,
  p_slug text,
  p_timezone text,
  p_terms_version text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_invite public.professional_invitations%rowtype;
  v_email text;
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_terms_version <> '2026-09-26' then
    raise exception 'Accept the current Bookzenvo Terms before joining';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'Verify your email before accepting this invitation';
  end if;

  select * into v_invite
  from public.professional_invitations
  where token = p_token and status = 'pending' and expires_at > now()
  for update;

  if v_invite.id is null then
    raise exception 'Invitation is no longer valid';
  end if;
  if v_email is distinct from lower(v_invite.email) then
    raise exception 'Sign in with the invited email address';
  end if;

  select b.id into v_business_id
  from public.businesses b
  where b.owner_id = auth.uid()
  order by b.created_at
  limit 1;

  if v_business_id is null then
    if char_length(trim(coalesce(p_business_name, ''))) not between 2 and 120 then
      raise exception 'Enter a business name between 2 and 120 characters';
    end if;
    if char_length(trim(coalesce(p_slug, ''))) not between 3 and 63
       or trim(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'Choose a valid booking page address';
    end if;
    if not exists (select 1 from pg_timezone_names tz where tz.name = p_timezone) then
      raise exception 'Choose a recognised timezone';
    end if;

    insert into public.businesses(owner_id, name, slug, timezone)
    values (auth.uid(), trim(p_business_name), trim(p_slug), p_timezone)
    returning id into v_business_id;
  end if;

  perform public.ensure_business_hours(v_business_id);

  perform public.accept_professional_invitation(p_token, v_business_id);
  update public.professional_invitations
  set terms_version=p_terms_version, terms_accepted_at=now(), terms_accepted_by=auth.uid()
  where id=v_invite.id;
  return v_business_id;
end;
$$;

revoke all on function public.accept_professional_invitation_with_workspace(text,text,text,text,text)
  from public, anon;
grant execute on function public.accept_professional_invitation_with_workspace(text,text,text,text,text)
  to authenticated;

alter table public.professional_invitations
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_accepted_by uuid references auth.users(id) on delete set null;
alter table public.staff_account_invitations
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_accepted_by uuid references auth.users(id) on delete set null;

-- Acceptance without a versioned clickwrap is no longer exposed directly.
revoke execute on function public.accept_professional_invitation(text,uuid)
  from authenticated;
revoke execute on function public.accept_staff_account_invitation(text)
  from authenticated;

create or replace function public.accept_staff_account_invitation_with_terms(
  p_token text,
  p_terms_version text
)
returns uuid
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_business_id uuid; v_verified boolean;
begin
  if p_terms_version <> '2026-09-26' then
    raise exception 'Accept the current Bookzenvo Terms before joining';
  end if;
  select u.email_confirmed_at is not null into v_verified
  from auth.users u where u.id=auth.uid();
  if coalesce(v_verified,false) is not true then
    raise exception 'Verify your email before accepting this invitation';
  end if;
  v_business_id := public.accept_staff_account_invitation(p_token);
  update public.staff_account_invitations
  set terms_version=p_terms_version, terms_accepted_at=now(), terms_accepted_by=auth.uid()
  where token_hash=encode(digest(p_token,'sha256'),'hex') and accepted_at is not null;
  return v_business_id;
end;
$$;
revoke all on function public.accept_staff_account_invitation_with_terms(text,text)
  from public,anon;
grant execute on function public.accept_staff_account_invitation_with_terms(text,text)
  to authenticated;

-- Possession of an invitation link is enough to view the invitation details,
-- but not the invitee's email address. Acceptance remains email-bound after
-- verified sign-in.
drop function if exists public.get_invitation_by_token(text);
create function public.get_invitation_by_token(_token text)
returns table(
  id uuid,salon_business_id uuid,chair_label text,rent_mode text,
  rent_amount_cents integer,commission_percent numeric,agreement_start date,
  agreement_end date,rent_due_day smallint,message text,expires_at timestamptz,
  salon_name text,salon_logo_url text
)
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select pi.id,pi.salon_business_id,pi.chair_label,pi.rent_mode,
    pi.rent_amount_cents,pi.commission_percent,pi.agreement_start,
    pi.agreement_end,pi.rent_due_day,pi.message,pi.expires_at,b.name,b.logo_url
  from public.professional_invitations pi join public.businesses b on b.id=pi.salon_business_id
  where pi.token=_token and pi.status='pending' and pi.expires_at>now() limit 1;
$$;
revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon,authenticated,service_role;

drop function if exists public.get_staff_account_invitation(text);
create function public.get_staff_account_invitation(_token text)
returns table(business_name text,staff_name text,access_role text,expires_at timestamptz)
language sql stable security definer set search_path=public,extensions as $$
  select b.name,s.name,i.access_role,i.expires_at from staff_account_invitations i
  join businesses b on b.id=i.business_id join staff s on s.id=i.staff_id
  where i.token_hash=encode(digest(_token,'sha256'),'hex')
    and i.accepted_at is null and i.revoked_at is null and i.expires_at>now();
$$;
revoke all on function public.get_staff_account_invitation(text) from public;
grant execute on function public.get_staff_account_invitation(text) to anon,authenticated,service_role;

-- Customer email is used only for the first verified claim. Portal access is
-- then bound to the immutable Auth user id, so a recycled mailbox cannot take
-- over historic records.
create or replace function public.claim_current_customer_records()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'Verify your email before claiming customer records';
  end if;

  update public.customers c
  set auth_user_id = auth.uid()
  where c.auth_user_id is null
    and lower(trim(c.email)) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.claim_current_customer_records()
  from public, anon;
grant execute on function public.claim_current_customer_records()
  to authenticated;

-- Preserve existing verified portal access during the migration. Records
-- already bound to a UID are never reassigned, and only confirmed Auth emails
-- can claim an unbound record.
update public.customers c
set auth_user_id = u.id
from auth.users u
where c.auth_user_id is null
  and u.email_confirmed_at is not null
  and lower(trim(c.email)) = lower(trim(u.email));

create or replace function public.is_current_customer(p_customer_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.customers c
    where c.id=p_customer_id and c.auth_user_id=auth.uid()
  );
$$;
revoke all on function public.is_current_customer(uuid) from public,anon;
grant execute on function public.is_current_customer(uuid) to authenticated;

drop policy if exists "Customers can view their bookings" on public.bookings;
create policy "Customers can view their bookings" on public.bookings
  for select to authenticated using (public.is_current_customer(customer_id));
drop policy if exists "Customers can update their bookings" on public.bookings;
create policy "Customers can update their bookings" on public.bookings
  for update to authenticated using (public.is_current_customer(customer_id))
  with check (public.is_current_customer(customer_id));
drop policy if exists "Customers can view their own customer record" on public.customers;
create policy "Customers can view their own customer record" on public.customers
  for select to authenticated using (auth_user_id=(select auth.uid()));
drop policy if exists "Customers can update their own customer record" on public.customers;
create policy "Customers can update their own customer record" on public.customers
  for update to authenticated using (auth_user_id=(select auth.uid()))
  with check (auth_user_id=(select auth.uid()));

create or replace function public.get_portal_bookings()
returns table(
  id uuid, business_id uuid, service_id uuid, staff_id uuid,
  customer_email text, starts_at timestamptz, ends_at timestamptz,
  status text, price_cents int, notes text, businesses jsonb,
  services jsonb, staff jsonb
)
language plpgsql stable security definer set search_path=public as $$
begin
  if exists(select 1 from bookings b join customers c on c.id=b.customer_id where c.auth_user_id=auth.uid())
     and not exists(
       select 1 from bookings b join customers c on c.id=b.customer_id
       join businesses biz on biz.id=b.business_id
       where c.auth_user_id=auth.uid() and biz.plan='studio'
     ) then
    raise exception 'This feature is on the Studio plan.';
  end if;
  return query
  select b.id,b.business_id,b.service_id,b.staff_id,b.customer_email,
    b.starts_at,b.ends_at,b.status,b.price_cents,b.notes,
    jsonb_build_object('id',biz.id,'name',biz.name,'slug',biz.slug,'address',biz.address,
      'page_theme',biz.page_theme,'cancellation_window_hours',biz.cancellation_window_hours),
    jsonb_build_object('id',sv.id,'name',sv.name,'duration_minutes',sv.duration_minutes,
      'gap_min',sv.gap_min,'active_after_min',sv.active_after_min),
    jsonb_build_object('id',st.id,'name',st.name)
  from bookings b join customers c on c.id=b.customer_id
  join businesses biz on biz.id=b.business_id and biz.plan='studio'
  left join services sv on sv.id=b.service_id left join staff st on st.id=b.staff_id
  where c.auth_user_id=auth.uid() order by b.starts_at desc limit 200;
end;$$;

create or replace function public.get_portal_customer_records()
returns table(id uuid,business_id uuid,name text,email text,phone text,businesses jsonb)
language plpgsql stable security definer set search_path=public as $$
begin
  if exists(select 1 from customers c where c.auth_user_id=auth.uid())
     and not exists(select 1 from customers c join businesses biz on biz.id=c.business_id
       where c.auth_user_id=auth.uid() and biz.plan='studio') then
    raise exception 'This feature is on the Studio plan.';
  end if;
  return query select c.id,c.business_id,c.name,c.email,c.phone,
    jsonb_build_object('name',biz.name)
  from customers c join businesses biz on biz.id=c.business_id and biz.plan='studio'
  where c.auth_user_id=auth.uid() order by c.created_at desc;
end;$$;

create or replace function public.request_customer_data_action(p_kind text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; v_email text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_kind not in('export','deletion') then raise exception 'Invalid request kind'; end if;
  select lower(email) into v_email from auth.users where id=auth.uid();
  insert into customer_data_requests(business_id,customer_id,email,kind)
  select c.business_id,c.id,coalesce(c.email,v_email),p_kind from customers c
  where c.auth_user_id=auth.uid() and not exists(
    select 1 from customer_data_requests r where r.business_id=c.business_id
      and r.customer_id=c.id and r.kind=p_kind and r.status='pending'
  );
  get diagnostics v_count=row_count;
  return v_count;
end;$$;

create or replace function public.enforce_studio_customer_portal_booking_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='authenticated' and public.is_current_customer(old.customer_id)
    and not public.is_business_owner(old.business_id)
    and not public.is_linked_pro_of(old.business_id) then
    perform public.require_studio_business(old.business_id);
  end if;
  return new;
end;$$;

create or replace function public.enforce_studio_customer_portal_profile_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='authenticated' and old.auth_user_id=auth.uid()
    and not public.is_business_owner(old.business_id) then
    perform public.require_studio_business(old.business_id);
  end if;
  return new;
end;$$;

create or replace function public.guard_customer_profile_updates()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='authenticated' and old.auth_user_id=auth.uid()
    and not public.is_business_owner(old.business_id) then
    if (to_jsonb(new)-array['name','phone','phone_normalized','updated_at'])
       is distinct from (to_jsonb(old)-array['name','phone','phone_normalized','updated_at']) then
      raise exception 'Customers can only change their name or phone number';
    end if;
  end if;
  return new;
end;$$;

create or replace function public.guard_customer_booking_updates()
returns trigger language plpgsql security definer set search_path=public as $$
declare validated_end timestamptz;
begin
  if auth.role()='authenticated' and public.is_current_customer(old.customer_id)
    and not public.is_business_owner(old.business_id)
    and not public.is_linked_pro_of(old.business_id) then
    if current_setting('bookzenvo.customer_reschedule',true)='1' then
      if old.status<>'confirmed' then raise exception 'Only confirmed bookings can be rescheduled'; end if;
      validated_end:=public.validate_public_booking_slot(old.business_id,old.service_id,old.staff_id,new.starts_at,old.id);
      if validated_end is distinct from new.ends_at or exists(
        select 1 from services where id=old.service_id and
          (gap_min is distinct from old.gap_min or active_after_min is distinct from old.active_after_min)
      ) then raise exception 'The service has changed; contact the business to reschedule'; end if;
      if (to_jsonb(new)-array['starts_at','ends_at','updated_at']) is distinct from
         (to_jsonb(old)-array['starts_at','ends_at','updated_at']) then
        raise exception 'Customers can only change booking time through reschedule';
      end if;
    else
      if (to_jsonb(new)-array['status','updated_at']) is distinct from
         (to_jsonb(old)-array['status','updated_at']) then
        raise exception 'Customers can only change booking status';
      end if;
      if new.status is distinct from old.status and new.status<>'cancelled' then
        raise exception 'Customers can only cancel a booking';
      end if;
    end if;
  end if;
  return new;
end;$$;

-- Demo/imported workspaces use these independent kill switches to prevent
-- accidental contact with real people. Owners cannot re-enable delivery.
create or replace function public.protect_business_suppression_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and (
    new.email_suppressed is distinct from old.email_suppressed or
    new.sms_suppressed is distinct from old.sms_suppressed or
    new.deletion_requested_at is distinct from old.deletion_requested_at or
    new.deletion_scheduled_for is distinct from old.deletion_scheduled_for
  ) then
    raise exception 'SYSTEM_FIELD: suppression and workspace-closure fields are server-managed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_business_suppression_fields on public.businesses;
create trigger protect_business_suppression_fields
  before update on public.businesses
  for each row execute function public.protect_business_suppression_fields();
revoke execute on function public.protect_business_suppression_fields()
  from public, anon, authenticated;

-- Workspace exports contain customer and consultation data. They are invoked
-- only by the server after a recent AAL2 check, never directly with a browser
-- session.
create or replace function public.export_owner_workspace(p_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_result jsonb;
  v_table text;
  v_rows jsonb;
  v_row_expression text;
  v_tables constant text[] := array[
    'staff','services','service_staff','customers','bookings','payments',
    'business_hours','business_hour_periods','blocked_dates','holiday_closures',
    'inventory_items','service_recipe_items','booking_stock_deductions',
    'business_media','page_layouts','page_edit_history','notifications',
    'customer_marketing_preferences','staff_hours','consultation_templates','consultation_template_services',
    'consultation_submissions','consultation_audit_events','customer_reviews',
    'review_moderation_events','customer_data_requests','import_batches'
  ];
begin
  select owner_id into v_owner from businesses where id = p_business_id;
  if v_owner is null or coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Workspace not found';
  end if;

  select jsonb_build_object(
    'formatVersion', 2,
    'generatedAt', now(),
    'business', to_jsonb(b) - array[
      'stripe_account_id','stripe_subscription_id','stripe_customer_id'
    ]
  ) into v_result
  from businesses b where b.id = p_business_id;

  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      v_row_expression := case v_table
        when 'customers' then 'to_jsonb(t) - array[''auth_user_id'',''stripe_customer_id'']'
        when 'bookings' then 'to_jsonb(t) - array[''stripe_charge_id'',''stripe_payment_intent_id'']'
        when 'payments' then 'to_jsonb(t) - array[''stripe_charge_id'',''stripe_payment_intent_id'',''stripe_refund_id'']'
        when 'customer_marketing_preferences' then 'to_jsonb(t) - ''unsubscribe_token'''
        else 'to_jsonb(t)'
      end;
      execute format(
        'select coalesce(jsonb_agg(%s), ''[]''::jsonb) from public.%I t where business_id = $1',
        v_row_expression, v_table
      ) into v_rows using p_business_id;
      v_result := v_result || jsonb_build_object(v_table, v_rows);
    end if;
  end loop;
  return v_result;
end;
$$;
revoke all on function public.export_owner_workspace(uuid)
  from public, anon, authenticated;
grant execute on function public.export_owner_workspace(uuid)
  to service_role;

-- These tables were added after the verified-session policy sweep. Keep MFA
-- and verified-email enforcement consistent for their authenticated reads.
drop policy if exists "verified sessions read gift card refunds" on public.gift_card_refunds;
create policy "verified sessions read gift card refunds" on public.gift_card_refunds
  as restrictive for select to authenticated
  using ((select public.session_has_required_assurance()));
drop policy if exists "verified sessions read stripe refund reviews" on public.stripe_refund_reviews;
create policy "verified sessions read stripe refund reviews" on public.stripe_refund_reviews
  as restrictive for select to authenticated
  using ((select public.session_has_required_assurance()));

create or replace function public.resolve_stripe_refund_review(p_stripe_refund_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if nullif(p_stripe_refund_id,'') is null then
    raise exception 'Invalid refund review';
  end if;
  delete from public.stripe_refund_reviews
  where stripe_refund_id=p_stripe_refund_id;
end;$$;
revoke all on function public.resolve_stripe_refund_review(text)
  from public,anon,authenticated;
grant execute on function public.resolve_stripe_refund_review(text) to service_role;

create or replace function public.record_stripe_refund_review(
  p_business_id uuid,
  p_stripe_payment_intent_id text,
  p_stripe_refund_id text,
  p_status text
)
returns void language plpgsql security definer set search_path=public as $$
declare previous stripe_refund_reviews%rowtype;
begin
  if nullif(p_stripe_refund_id,'') is null
     or nullif(p_stripe_payment_intent_id,'') is null
     or p_status is null
     or p_status not in('failed','canceled','requires_action') then
    raise exception 'Invalid refund review';
  end if;
  perform pg_advisory_xact_lock(hashtext('refund-review:'||p_stripe_refund_id));
  -- A delayed adverse webhook must not reopen an alert after a later success
  -- has already been committed to either verified refund ledger.
  if exists(select 1 from payments where stripe_refund_id=p_stripe_refund_id and status='succeeded')
     or exists(select 1 from gift_card_refunds where stripe_refund_id=p_stripe_refund_id) then
    delete from stripe_refund_reviews where stripe_refund_id=p_stripe_refund_id;
    return;
  end if;
  if not exists(select 1 from payments where business_id=p_business_id and stripe_payment_intent_id=p_stripe_payment_intent_id and type='charge' and status='succeeded')
     and not exists(select 1 from gift_cards where business_id=p_business_id and stripe_payment_intent_id=p_stripe_payment_intent_id and source='stripe_purchase') then
    raise exception 'Refund purchase is not yet reconciled';
  end if;
  select * into previous from stripe_refund_reviews where stripe_refund_id=p_stripe_refund_id;
  if found and (previous.business_id is distinct from p_business_id or previous.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id) then
    raise exception 'Refund review identity mismatch';
  end if;
  insert into stripe_refund_reviews(stripe_refund_id,business_id,stripe_payment_intent_id,provider_status)
  values(p_stripe_refund_id,p_business_id,p_stripe_payment_intent_id,p_status)
  on conflict(stripe_refund_id) do update
    set provider_status=excluded.provider_status,manual_review=true,updated_at=now();
end;$$;
revoke all on function public.record_stripe_refund_review(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_stripe_refund_review(uuid,text,text,text)
  to service_role;

-- Storage is same-origin through Bookzenvo's proxy. Refuse active document
-- types (HTML/SVG) and oversized files even if a future UI validation regresses.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id in ('business-assets', 'business-public-assets');

-- Explicit deny policies make the intent of service-only tables visible to
-- operators and static advisers. service_role bypasses RLS as before.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'balance_checkout_attempts', 'booking_change_email_outbox',
    'booking_checkout_holds', 'booking_payment_issues',
    'business_usage_counters', 'business_usage_limits',
    'notification_request_snapshots', 'public_request_counters',
    'studio_checkout_attempts', 'customer_erasure_storage_jobs'
  ] loop
    execute format('drop policy if exists "server only" on public.%I', v_table);
    execute format(
      'create policy "server only" on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      v_table
    );
  end loop;
end;
$$;

-- Avoid a separate auth-function call for every candidate row. Wrapping the
-- stable auth helpers in a scalar subquery makes PostgreSQL initialise them
-- once per statement while preserving every policy's meaning and roles.
do $$
declare
  p record;
  v_using text;
  v_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') ~ 'auth\.(uid|role|email|jwt)\(\)'
        or coalesce(with_check, '') ~ 'auth\.(uid|role|email|jwt)\(\)')
  loop
    v_using := p.qual;
    v_check := p.with_check;
    if v_using is not null then
      v_using := regexp_replace(v_using, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      v_using := regexp_replace(v_using, 'auth\.role\(\)', '(select auth.role())', 'g');
      v_using := regexp_replace(v_using, 'auth\.email\(\)', '(select auth.email())', 'g');
      v_using := regexp_replace(v_using, 'auth\.jwt\(\)', '(select auth.jwt())', 'g');
    end if;
    if v_check is not null then
      v_check := regexp_replace(v_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      v_check := regexp_replace(v_check, 'auth\.role\(\)', '(select auth.role())', 'g');
      v_check := regexp_replace(v_check, 'auth\.email\(\)', '(select auth.email())', 'g');
      v_check := regexp_replace(v_check, 'auth\.jwt\(\)', '(select auth.jwt())', 'g');
    end if;
    if v_using is not null and v_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, v_using, v_check);
    elsif v_using is not null then
      execute format('alter policy %I on %I.%I using (%s)',
        p.policyname, p.schemaname, p.tablename, v_using);
    elsif v_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)',
        p.policyname, p.schemaname, p.tablename, v_check);
    end if;
  end loop;
end;
$$;

-- Add a compact supporting index for every foreign key whose leading columns
-- are not already covered. This is generated from the catalogue so future
-- schema additions receive the same safe treatment when this migration runs.
do $$
declare
  fk record;
  v_columns text;
  v_index_name text;
begin
  for fk in
    select c.oid, c.conrelid, c.conkey, n.nspname, t.relname, c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisvalid and i.indpred is null
          and (select array_agg(k order by ord)
               from unnest(i.indkey::smallint[]) with ordinality x(k, ord)
               where ord <= cardinality(c.conkey)) = c.conkey
      )
  loop
    select string_agg(format('%I', a.attname), ', ' order by keys.ord)
      into v_columns
    from unnest(fk.conkey) with ordinality keys(attnum, ord)
    join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = keys.attnum;
    v_index_name := 'idx_fk_' || substr(md5(fk.nspname || '.' || fk.relname || '.' || fk.conname), 1, 20);
    execute format('create index if not exists %I on %I.%I (%s)',
      v_index_name, fk.nspname, fk.relname, v_columns);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
