-- Keep booking details inside Bookzenvo's private checkout reservation instead
-- of copying them into Stripe metadata. Stripe still receives the payer email
-- through its dedicated Checkout field so it can process the payment/receipt.
alter table public.booking_checkout_holds
  add column customer_name text,
  add column customer_email text,
  add column customer_phone text,
  add column notes text,
  add column sms_reminder_notice boolean not null default false,
  add column email_marketing_consent boolean not null default false,
  add column booking_source text;

alter table public.booking_checkout_holds
  add constraint booking_checkout_hold_customer_name_length
    check (customer_name is null or char_length(customer_name) between 1 and 120),
  add constraint booking_checkout_hold_customer_email_length
    check (customer_email is null or char_length(customer_email) between 3 and 320),
  add constraint booking_checkout_hold_customer_phone_length
    check (customer_phone is null or char_length(customer_phone) <= 40),
  add constraint booking_checkout_hold_notes_length
    check (notes is null or char_length(notes) <= 500),
  add constraint booking_checkout_hold_booking_source_length
    check (booking_source is null or char_length(booking_source) <= 100);

create function public.prune_expired_booking_checkout_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  -- Retain successful checkout details briefly so a delayed/retried webhook can
  -- finish consent and attribution bookkeeping, then remove the duplicate PII.
  update public.booking_checkout_holds
  set customer_name = null,
      customer_email = null,
      customer_phone = null,
      notes = null,
      sms_reminder_notice = false,
      email_marketing_consent = false,
      booking_source = null
  where fulfilled_booking_id is not null
    and created_at < now() - interval '1 day'
    and (
      customer_name is not null or customer_email is not null or
      customer_phone is not null or notes is not null or
      sms_reminder_notice or email_marketing_consent or booking_source is not null
    );

  delete from public.booking_checkout_holds h
  where h.fulfilled_booking_id is null
    and h.expires_at < now() - interval '1 day'
    and not exists (
      select 1 from public.booking_payment_issues i where i.hold_id = h.id
    );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_expired_booking_checkout_holds() from public, anon, authenticated;
grant execute on function public.prune_expired_booking_checkout_holds() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'prune-expired-booking-checkout-holds';

select cron.schedule(
  'prune-expired-booking-checkout-holds',
  '37 * * * *',
  $$select public.prune_expired_booking_checkout_holds()$$
);
