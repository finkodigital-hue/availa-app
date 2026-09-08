-- Unified owner notification preferences and outbound delivery history.
-- Provider credentials and message bodies remain server-side; owners can only
-- read the operational metadata exposed by the server API.
create table public.notification_preferences (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  owner_booking_created boolean not null default true,
  owner_booking_cancelled boolean not null default true,
  owner_consultation_signed boolean not null default true,
  owner_low_stock boolean not null default true,
  owner_payment_failed boolean not null default true,
  customer_booking_confirmation boolean not null default true,
  customer_booking_reminder boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel text not null check (channel in ('email')),
  message_type text not null,
  recipient_masked text not null,
  subject text not null,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','suppressed')),
  idempotency_key text not null,
  provider text,
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  unique (provider, provider_message_id)
);

create index notification_deliveries_business_created_idx
  on public.notification_deliveries (business_id, created_at desc);
create index notification_deliveries_retry_idx
  on public.notification_deliveries (status, next_attempt_at)
  where status = 'failed';

alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
revoke all on public.notification_deliveries from anon, authenticated;
grant all on public.notification_preferences to service_role;
grant all on public.notification_deliveries to service_role;

-- Extend the in-app feed for operational owner alerts. These are created in
-- the database so every server write path (including Stripe/webhook RPCs) is covered.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'booking_created','booking_cancelled','consultation_signed','low_stock','payment_failed'
));

create or replace function public.notification_preference_enabled(p_business_id uuid, p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_name
      when 'owner_booking_created' then owner_booking_created
      when 'owner_booking_cancelled' then owner_booking_cancelled
      when 'owner_consultation_signed' then owner_consultation_signed
      when 'owner_low_stock' then owner_low_stock
      when 'owner_payment_failed' then owner_payment_failed
      else true end
    from public.notification_preferences where business_id = p_business_id
  ), true)
$$;

create or replace function public.notify_consultation_signed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.signed_at is not null and (tg_op = 'INSERT' or old.signed_at is null)
     and public.notification_preference_enabled(new.business_id, 'owner_consultation_signed') then
    insert into public.notifications (business_id,type,title,body,link)
    values (new.business_id,'consultation_signed','Consultation form signed','A customer consultation is ready to review.','/consultations');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_consultation_signed on public.consultation_submissions;
create trigger trg_notify_consultation_signed after insert or update of signed_at on public.consultation_submissions
for each row execute function public.notify_consultation_signed();

create or replace function public.notify_low_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.low_stock_threshold is not null and new.current_stock <= new.low_stock_threshold
     and (tg_op = 'INSERT' or old.low_stock_threshold is null
       or old.current_stock > old.low_stock_threshold)
     and public.notification_preference_enabled(new.business_id, 'owner_low_stock') then
    insert into public.notifications (business_id,type,title,body,link)
    values (new.business_id,'low_stock','Low stock: ' || new.name,
      new.current_stock || ' ' || coalesce(new.unit, 'units') || ' remaining.','/stock');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_low_stock on public.inventory_items;
create trigger trg_notify_low_stock after insert or update of current_stock, low_stock_threshold on public.inventory_items
for each row execute function public.notify_low_stock();

create or replace function public.notify_payment_failed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'failed' and (tg_op = 'INSERT' or old.payment_status is distinct from 'failed')
     and public.notification_preference_enabled(new.business_id, 'owner_payment_failed') then
    insert into public.notifications (business_id,type,title,body,link)
    values (new.business_id,'payment_failed','Payment failed: ' || coalesce(new.customer_name,'Customer'),
      'Review the booking and contact the customer if needed.','/payments');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_payment_failed on public.bookings;
create trigger trg_notify_payment_failed after insert or update of payment_status on public.bookings
for each row execute function public.notify_payment_failed();

-- Make the original booking feed preferences effective without changing any callers.
create or replace function public.notify_booking_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from 'cancelled'
     and public.notification_preference_enabled(new.business_id, 'owner_booking_created') then
    insert into public.notifications (business_id,type,title,body,link)
    values (new.business_id,'booking_created','New booking: ' || coalesce(new.customer_name,'Walk-in'),
      to_char(new.starts_at,'Dy, Mon DD') || ' at ' || to_char(new.starts_at,'HH12:MI am'),'/calendar');
  end if;
  return new;
end $$;

create or replace function public.notify_booking_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and public.notification_preference_enabled(new.business_id, 'owner_booking_cancelled') then
    insert into public.notifications (business_id,type,title,body,link)
    values (new.business_id,'booking_cancelled','Booking cancelled: ' || coalesce(new.customer_name,'Walk-in'),
      to_char(new.starts_at,'Dy, Mon DD') || ' at ' || to_char(new.starts_at,'HH12:MI am'),'/calendar');
  end if;
  return new;
end $$;
