-- Google Calendar integration, Piece 1: outbound-only push of Bookzenvo
-- bookings to ONE shared Google Calendar per business. We never import or
-- read the business's own Google events — availability stays driven
-- entirely by staff_hours/blocked_dates/bookings (see slots.ts) — a shared
-- salon calendar can't be attributed to a specific staff member, so an
-- imported busy event would wrongly block everyone.
--
-- Architecture: an AFTER INSERT/UPDATE trigger on bookings calls an internal
-- app route via pg_net (same pattern already used for the reminders cron —
-- see 20260723150000_add_booking_reminders.sql), rather than each of the ~7
-- TS write paths (staff-side create, public create, Stripe webhook,
-- token-reschedule, portal reschedule, calendar drag, calendar resize)
-- calling it explicitly. This project's own history this session found two
-- previously-missed write paths under the "call explicitly" approach
-- (fulfill_stripe_checkout, and the calendar drag/resize conflict gap) — a
-- DB trigger can't miss a path by construction, at the cost of a few
-- seconds of async latency (same latency class as the existing reminder
-- pipeline, which is already async via the same pg_net mechanism).

create extension if not exists pg_net with schema extensions;

-- 1. Per-business connection state. Deliberately holds NO token bytes at
-- all — only opaque Vault secret-id UUIDs. Vault (pgsodium-backed) is
-- already live on this project (see the cron secret in the reminders
-- migration) — reusing it here means the actual access/refresh token bytes
-- live in a separate, privilege-gated schema (`vault`) that `authenticated`
-- has no grants on, rather than inventing a second, parallel encryption
-- scheme. Even a fully-compromised client-side query against this table
-- can only ever retrieve meaningless UUIDs.
create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  google_account_email text not null,
  google_calendar_id text not null,
  google_calendar_summary text,
  access_token_secret_id uuid not null,
  refresh_token_secret_id uuid not null,
  access_token_expires_at timestamptz not null,
  -- 'connected': syncing normally. 'needs_reconnect': Google rejected the
  -- refresh token (revoked/expired) — surfaced in Settings, bookings
  -- continue working normally, sync just pauses until the owner
  -- reconnects. 'disconnected' is never stored — disconnecting deletes the
  -- row outright (see disconnect_google_calendar below).
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_google_calendar_connection_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists set_updated_at on public.google_calendar_connections;
create trigger set_updated_at
before update on public.google_calendar_connections
for each row execute function public.set_google_calendar_connection_updated_at();

alter table public.google_calendar_connections enable row level security;

-- The owner can read their own connection's status/display fields directly
-- (nothing sensitive lives in the row — see above) to render Settings'
-- connected-state UI without a round trip through a server route. All
-- WRITES go through the SECURITY DEFINER functions below instead of direct
-- table access, since creating/rotating a connection must also touch Vault.
drop policy if exists "owner reads own google calendar connection" on public.google_calendar_connections;
create policy "owner reads own google calendar connection"
  on public.google_calendar_connections for select
  to authenticated
  using (public.is_business_owner(business_id));

-- No insert/update/delete policies — only the SECURITY DEFINER functions
-- below (called with the service role from server routes) can write here.

-- 2. Idempotent event mapping — one Google event per booking, stored
-- directly on the row (mirrors bookings.stripe_payment_intent_id) rather
-- than a separate mapping table, since the relationship is genuinely 1:1
-- with the booking's own lifecycle. Null means "never successfully pushed
-- yet" (or the connection didn't exist at creation time) — the sync route
-- INSERTs a new Google event in that case; non-null means UPDATE the
-- existing one, keeping retries/re-pushes idempotent.
alter table public.bookings
  add column if not exists google_event_id text;

-- 3. Vault-backed token read/write. SECURITY DEFINER + revoked from
-- anon/authenticated + granted only to service_role — the same pattern
-- already used for fulfill_stripe_checkout etc: only server code calling
-- with the service-role key can ever invoke these, never a client session.
--
-- upsert_google_calendar_connection: called once by the OAuth callback
-- route right after exchanging Google's auth code for tokens. Creates the
-- connection row on first connect; on reconnect (owner had a
-- needs_reconnect row and re-authorizes), replaces the existing Vault
-- secrets in place via vault.update_secret rather than leaving the old,
-- now-invalid ones orphaned.
create or replace function public.upsert_google_calendar_connection(
  p_business_id uuid,
  p_google_account_email text,
  p_google_calendar_id text,
  p_google_calendar_summary text,
  p_access_token text,
  p_refresh_token text,
  p_access_token_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing record;
  v_access_secret_id uuid;
  v_refresh_secret_id uuid;
begin
  select access_token_secret_id, refresh_token_secret_id into v_existing
    from public.google_calendar_connections where business_id = p_business_id;

  if v_existing is not null then
    perform vault.update_secret(v_existing.access_token_secret_id, p_access_token);
    perform vault.update_secret(v_existing.refresh_token_secret_id, p_refresh_token);
    update public.google_calendar_connections
       set google_account_email = p_google_account_email,
           google_calendar_id = p_google_calendar_id,
           google_calendar_summary = p_google_calendar_summary,
           access_token_expires_at = p_access_token_expires_at,
           status = 'connected',
           last_sync_error = null
     where business_id = p_business_id;
  else
    v_access_secret_id := vault.create_secret(p_access_token, 'google_access_token_' || p_business_id::text);
    v_refresh_secret_id := vault.create_secret(p_refresh_token, 'google_refresh_token_' || p_business_id::text);
    insert into public.google_calendar_connections (
      business_id, google_account_email, google_calendar_id, google_calendar_summary,
      access_token_secret_id, refresh_token_secret_id, access_token_expires_at
    ) values (
      p_business_id, p_google_account_email, p_google_calendar_id, p_google_calendar_summary,
      v_access_secret_id, v_refresh_secret_id, p_access_token_expires_at
    );
  end if;
end;
$$;

revoke all on function public.upsert_google_calendar_connection(uuid, text, text, text, text, text, timestamptz) from public;
revoke all on function public.upsert_google_calendar_connection(uuid, text, text, text, text, text, timestamptz) from anon, authenticated;
grant execute on function public.upsert_google_calendar_connection(uuid, text, text, text, text, text, timestamptz) to service_role;

-- get_google_calendar_credentials: called by the internal sync route (and
-- by the token-refresh step before it) to get the decrypted tokens for a
-- business. Returns zero rows if there's no connection at all (business
-- never connected, or has since disconnected) — callers treat that as
-- "nothing to sync", not an error.
create or replace function public.get_google_calendar_credentials(p_business_id uuid)
returns table (
  google_calendar_id text,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
    select c.google_calendar_id,
           (select decrypted_secret from vault.decrypted_secrets where id = c.access_token_secret_id),
           (select decrypted_secret from vault.decrypted_secrets where id = c.refresh_token_secret_id),
           c.access_token_expires_at,
           c.status
    from public.google_calendar_connections c
    where c.business_id = p_business_id;
end;
$$;

revoke all on function public.get_google_calendar_credentials(uuid) from public;
revoke all on function public.get_google_calendar_credentials(uuid) from anon, authenticated;
grant execute on function public.get_google_calendar_credentials(uuid) to service_role;

-- update_google_calendar_access_token: called after the sync route
-- refreshes an expired access token. p_new_refresh_token is optional since
-- Google does not always rotate the refresh token on a refresh grant —
-- only update it in Vault when Google actually issued a new one.
create or replace function public.update_google_calendar_access_token(
  p_business_id uuid,
  p_access_token text,
  p_access_token_expires_at timestamptz,
  p_new_refresh_token text default null
) returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing record;
begin
  select access_token_secret_id, refresh_token_secret_id into v_existing
    from public.google_calendar_connections where business_id = p_business_id;
  if v_existing is null then
    return;
  end if;

  perform vault.update_secret(v_existing.access_token_secret_id, p_access_token);
  if p_new_refresh_token is not null then
    perform vault.update_secret(v_existing.refresh_token_secret_id, p_new_refresh_token);
  end if;

  update public.google_calendar_connections
     set access_token_expires_at = p_access_token_expires_at
   where business_id = p_business_id;
end;
$$;

revoke all on function public.update_google_calendar_access_token(uuid, text, timestamptz, text) from public;
revoke all on function public.update_google_calendar_access_token(uuid, text, timestamptz, text) from anon, authenticated;
grant execute on function public.update_google_calendar_access_token(uuid, text, timestamptz, text) to service_role;

-- mark_google_calendar_sync_result: called by the sync route after every
-- attempt, success or failure, so Settings' "is it working?" status
-- (last_synced_at / last_sync_error) is always current. A revoked/expired
-- refresh token (Google returns invalid_grant on the refresh attempt) sets
-- status to needs_reconnect — the ONLY way back to 'connected' is the owner
-- re-running the OAuth consent flow, which calls upsert_google_calendar_connection
-- again with fresh tokens.
create or replace function public.mark_google_calendar_sync_result(
  p_business_id uuid,
  p_success boolean,
  p_error text default null,
  p_needs_reconnect boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.google_calendar_connections
     set last_synced_at = case when p_success then now() else last_synced_at end,
         last_sync_error = p_error,
         status = case when p_needs_reconnect then 'needs_reconnect' else status end
   where business_id = p_business_id;
end;
$$;

revoke all on function public.mark_google_calendar_sync_result(uuid, boolean, text, boolean) from public;
revoke all on function public.mark_google_calendar_sync_result(uuid, boolean, text, boolean) from anon, authenticated;
grant execute on function public.mark_google_calendar_sync_result(uuid, boolean, text, boolean) to service_role;

-- disconnect_google_calendar: callable directly by the owner from Settings
-- (SECURITY DEFINER since deleting the Vault secrets needs vault-schema
-- privileges `authenticated` doesn't have — the function does its OWN
-- is_business_owner check since running as definer bypasses RLS). Deletes
-- the connection row AND its Vault secrets outright — no soft-delete state,
-- disconnecting is meant to fully revoke Bookzenvo's stored copy of the
-- tokens, not just hide them.
create or replace function public.disconnect_google_calendar(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing record;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Not authorized to disconnect this business''s Google Calendar';
  end if;

  select access_token_secret_id, refresh_token_secret_id into v_existing
    from public.google_calendar_connections where business_id = p_business_id;
  if v_existing is null then
    return;
  end if;

  delete from public.google_calendar_connections where business_id = p_business_id;
  perform vault.delete_secret(v_existing.access_token_secret_id);
  perform vault.delete_secret(v_existing.refresh_token_secret_id);
end;
$$;

revoke all on function public.disconnect_google_calendar(uuid) from public;
grant execute on function public.disconnect_google_calendar(uuid) to authenticated;

-- 4. The trigger. SECURITY DEFINER so it always has sufficient privilege to
-- query google_calendar_connections and call net.http_post regardless of
-- which role performed the triggering write (anon via create_public_booking,
-- authenticated via create_staff_booking/move_booking, etc — none of those
-- roles have direct grants on the net schema themselves).
--
-- Only fires when: (a) the business actually has a 'connected' row — the
-- overwhelming majority of businesses with no connection at all pay zero
-- cost, not even a pg_net call; and (b) for UPDATEs, a calendar-relevant
-- field actually changed — an unrelated write (payment_status, notes,
-- confirmation_sent_at, etc) does not trigger a pointless push.
create or replace function public.sync_booking_to_google_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_is_connected boolean;
  v_relevant_change boolean;
begin
  select exists (
    select 1 from public.google_calendar_connections
    where business_id = NEW.business_id and status = 'connected'
  ) into v_is_connected;

  if not v_is_connected then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    v_relevant_change := true;
  else
    v_relevant_change :=
      NEW.starts_at is distinct from OLD.starts_at
      or NEW.ends_at is distinct from OLD.ends_at
      or NEW.staff_id is distinct from OLD.staff_id
      or NEW.status is distinct from OLD.status
      or NEW.customer_name is distinct from OLD.customer_name
      or NEW.service_id is distinct from OLD.service_id
      or NEW.gap_min is distinct from OLD.gap_min
      or NEW.active_after_min is distinct from OLD.active_after_min
      or NEW.custom_title is distinct from OLD.custom_title;
  end if;

  if not v_relevant_change then
    return NEW;
  end if;

  -- Fire-and-forget, same as the existing reminders cron: a dropped/failed
  -- call here is not retried by this trigger itself. Unlike the cron sweep
  -- (which re-derives "who's due" from scratch every 15 minutes and so
  -- naturally catches anything missed), a missed booking-change push has no
  -- automatic backstop today — flagged in the verification report, not
  -- silently assumed away.
  --
  -- The bearer secret is a Vault secret, not inlined here, matching
  -- 20260723150000's cron_reminder_secret pattern exactly. After this
  -- migration is applied, set it once via the SQL editor (not committed):
  --   select vault.create_secret('<random-generated-value>', 'google_calendar_sync_secret');
  -- and set the SAME value as the Cloudflare Worker secret
  -- GOOGLE_CALENDAR_SYNC_SECRET (server-only, no VITE_ prefix) for the
  -- internal route to check it against.
  perform net.http_post(
    url := 'https://bookzenvo.com/api/internal/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'google_calendar_sync_secret'
      )
    ),
    body := jsonb_build_object('booking_id', NEW.id)
  );

  return NEW;
end;
$$;

drop trigger if exists sync_booking_to_google_calendar on public.bookings;
create trigger sync_booking_to_google_calendar
after insert or update on public.bookings
for each row execute function public.sync_booking_to_google_calendar();
