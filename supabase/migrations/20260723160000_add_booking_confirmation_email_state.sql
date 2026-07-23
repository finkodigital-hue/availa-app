-- Tracks whether the (not-gated) booking confirmation email has gone out.
-- Sent immediately by /api/bookings/send-confirmation right after booking
-- creation; the sweep in /api/cron/send-reminders is only a backstop for
-- when that immediate call never arrives.
alter table public.bookings
  add column if not exists confirmation_sent_at timestamptz;
