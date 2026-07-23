-- Permanent, per-business "never mails out" marker — independent of plan
-- and independent of APP_ENV. A business on plan='studio' in production
-- still can't trigger a real send if this is true; checked inside
-- sendEmail() (src/lib/resend.server.ts) alongside the environment guard,
-- not left to individual call sites.
--
-- Intended for any workspace holding real people's data that isn't meant to
-- actually contact them — imported demo data, prospect salons' real client
-- lists used for sales demos, etc. Not a testshop-specific hack.
alter table public.businesses
  add column if not exists email_suppressed boolean not null default false;

-- testshop holds a real Fresha export (real names/emails, 245 future
-- bookings) — see conversation 2026-07-23. Suppressed permanently regardless
-- of whatever plan it's set to for testing.
update public.businesses set email_suppressed = true where slug = 'testshop';
