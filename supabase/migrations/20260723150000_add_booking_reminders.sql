-- Appointment reminder emails: scheduling state, one-tap action tokens,
-- failure logging, and the pg_cron sweep that drives them.

-- 1. Extensions needed for the sweep (bundled with Supabase, no extra cost).
--    Enabling these requires DB owner privileges; if this errors when applied,
--    flip them on first via Dashboard > Database > Extensions, then re-run.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2. Business-level reminder lead time.
alter table public.businesses
  add column if not exists reminder_hours_before int not null default 24;

-- 3. Reminder + client-confirmation state on the booking.
--    Kept separate from `status` because bookings already default to
--    status='confirmed' at creation (owner auto-accepts) — these track
--    whether *the client* has since confirmed via the reminder link,
--    and whether a reminder has gone out at all (for the no-double-send guard).
alter table public.bookings
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists client_confirmed_at timestamptz;

-- 4. Single-use, expiring action tokens for the email's Confirm/Cancel/Reschedule links.
--    Raw token only ever exists in the emailed URL; we store its SHA-256 hash.
--    Deliberately NO RLS policies for anon/authenticated — only the
--    service-role server route ever touches this table, so there is no
--    PostgREST path to read/guess another booking's token at all.
create table public.booking_action_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  action text not null check (action in ('confirm','cancel','reschedule')),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index booking_action_tokens_token_hash_idx on public.booking_action_tokens(token_hash);
create index booking_action_tokens_booking_id_idx on public.booking_action_tokens(booking_id);

alter table public.booking_action_tokens enable row level security;
-- No policies added on purpose — RLS with zero policies denies all
-- anon/authenticated access; only supabaseAdmin (service role) can read/write.

-- 5. Failure log for reminder sends — the app route claims a booking
--    (reminder_sent_at = now()) immediately before calling Resend; if Resend
--    errors, the route resets reminder_sent_at back to NULL (so the next
--    15-min sweep retries it — self-limiting, since the "due" query only
--    selects bookings whose appointment hasn't happened yet) AND writes a
--    row here so failures are visible without digging through Worker logs.
create table public.reminder_send_failures (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  error text not null,
  attempted_at timestamptz not null default now()
);

create index reminder_send_failures_booking_id_idx on public.reminder_send_failures(booking_id);

alter table public.reminder_send_failures enable row level security;
-- No policies added on purpose, same reasoning as booking_action_tokens:
-- service-role only. (Worth surfacing in an admin view later if failures
-- turn out to be common enough to need one — not scoped in this pass.)

-- 6. Reschedule invalidates the reminder lifecycle, regardless of which code
--    path performs the reschedule (existing portal flow, or the new
--    token-authenticated email-reschedule flow) — mirrors how
--    enforce_booking_change_window() already guards changes generically
--    rather than trusting each call site to remember.
create or replace function public.reset_reminder_state_on_reschedule()
returns trigger language plpgsql as $$
begin
  if NEW.starts_at is distinct from OLD.starts_at then
    NEW.reminder_sent_at := null;
    NEW.client_confirmed_at := null;
  end if;
  return NEW;
end $$;

drop trigger if exists reset_reminder_state on public.bookings;
create trigger reset_reminder_state
before update on public.bookings
for each row execute function public.reset_reminder_state_on_reschedule();

create or replace function public.invalidate_tokens_on_reschedule()
returns trigger language plpgsql as $$
begin
  if NEW.starts_at is distinct from OLD.starts_at then
    delete from public.booking_action_tokens
      where booking_id = NEW.id and used_at is null;
  end if;
  return NEW;
end $$;

drop trigger if exists invalidate_tokens_on_reschedule on public.bookings;
create trigger invalidate_tokens_on_reschedule
after update on public.bookings
for each row execute function public.invalidate_tokens_on_reschedule();

-- 7. The sweep itself: wakes the app up every 15 minutes. It does NOT decide
--    who's due — that logic lives in the app route (source of truth), so a
--    dropped/failed pg_net call (fire-and-forget, no retry) just gets picked
--    up by the next tick 15 min later. The route's own query
--    (reminder_sent_at IS NULL AND starts_at is within the reminder window)
--    makes re-running safe — nothing here assumes the previous tick succeeded.
--
--    The bearer secret is intentionally NOT inlined here (this file goes into
--    git history). After this migration is applied, the secret is set once
--    via the SQL editor (not committed):
--      select vault.create_secret('<random-generated-value>', 'cron_reminder_secret');
--    and the SAME value is set as a Cloudflare Worker secret (CRON_REMINDER_SECRET,
--    no VITE_ prefix — server-only, never in the client bundle) for the app
--    route to check it against.
select cron.schedule(
  'send-booking-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://bookzenvo.com/api/cron/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_reminder_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
