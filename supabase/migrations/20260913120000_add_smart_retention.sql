-- Service-led aftercare and consent-bound rebooking reminders.
-- Marketing preferences stay server-only so public clients cannot inspect or
-- alter another customer's consent record.

alter table public.services
  add column if not exists aftercare_message text,
  add column if not exists rebooking_interval_days integer;

alter table public.services
  add constraint services_aftercare_message_length
    check (aftercare_message is null or char_length(aftercare_message) <= 2000),
  add constraint services_rebooking_interval_days_range
    check (rebooking_interval_days is null or rebooking_interval_days between 7 and 365);

alter table public.bookings
  add column if not exists aftercare_sent_at timestamptz,
  add column if not exists rebooking_reminder_sent_at timestamptz;

alter table public.notification_preferences
  add column if not exists customer_aftercare_email boolean not null default true,
  add column if not exists customer_rebooking_email boolean not null default false;

create table if not exists public.customer_marketing_preferences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  status text not null check (status in ('subscribed', 'unsubscribed')),
  consent_version text not null,
  source text not null check (source in ('booking', 'salon', 'unsubscribe')),
  granted_at timestamptz,
  revoked_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, customer_id, channel),
  check (
    (status = 'subscribed' and granted_at is not null) or
    (status = 'unsubscribed' and revoked_at is not null)
  )
);

create index if not exists customer_marketing_preferences_active_idx
  on public.customer_marketing_preferences (business_id, channel, customer_id)
  where status = 'subscribed';

create index if not exists bookings_aftercare_due_idx
  on public.bookings (business_id, ends_at)
  where status = 'completed' and aftercare_sent_at is null;

create index if not exists bookings_rebooking_due_idx
  on public.bookings (business_id, ends_at)
  where status = 'completed' and rebooking_reminder_sent_at is null;

alter table public.customer_marketing_preferences enable row level security;
revoke all on public.customer_marketing_preferences from anon, authenticated;
grant all on public.customer_marketing_preferences to service_role;

comment on table public.customer_marketing_preferences is
  'Auditable, channel-specific salon marketing consent. Operational appointment messages do not use this table.';
comment on column public.services.aftercare_message is
  'Optional service-specific care instructions sent after a completed appointment.';
comment on column public.services.rebooking_interval_days is
  'Typical service repeat interval used for consent-bound rebooking reminders.';
