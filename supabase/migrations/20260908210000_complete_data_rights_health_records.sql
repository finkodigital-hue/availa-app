-- Complete the customer rights workflow for consultation and patch-test data.
-- These records can contain special-category health data and signatures. They
-- must be included in an access/portability export and must not silently remain
-- after the product tells an owner that erasure is complete.
--
-- A controller that must preserve a particular record for a legal claim should
-- not run erasure until it has assessed and documented the applicable UK GDPR
-- restriction or exemption outside Bookzenvo. The product has no legal-hold
-- feature and therefore deletes these records when erasure is confirmed.

alter table public.customer_data_requests
  add column if not exists due_at timestamptz not null
    default (now() + interval '1 month');

-- Rows created before this migration should keep a deadline measured from the
-- actual request, not receive a fresh month merely because the schema changed.
update public.customer_data_requests
set due_at = created_at + interval '1 month'
where status = 'pending';

create index if not exists customer_data_requests_pending_due_idx
  on public.customer_data_requests (business_id, due_at)
  where status = 'pending';

create or replace function public.erase_customer(
  p_business_id uuid,
  p_customer_id uuid,
  p_request_id uuid,
  p_resolved_by uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_email text;
  v_upcoming_count integer;
  v_bookings_scrubbed integer;
  v_payments_scrubbed integer;
  v_notifications_deleted integer;
  v_consultations_deleted integer;
  v_other_business_has_live_email boolean;
begin
  select name, email into v_name, v_email
  from customers
  where id = p_customer_id and business_id = p_business_id
  for update;
  if not found then raise exception 'Customer not found'; end if;

  select count(*) into v_upcoming_count
  from bookings
  where customer_id = p_customer_id and status <> 'cancelled' and starts_at > now();
  if v_upcoming_count > 0 then
    raise exception 'UPCOMING_BOOKINGS:%', v_upcoming_count;
  end if;

  v_other_business_has_live_email := v_email is not null and exists (
    select 1 from customers
    where lower(email) = lower(v_email)
      and business_id <> p_business_id and email is not null
  );

  -- Audit events cascade with their submission. Keeping an audit event that
  -- points to erased signed answers would defeat the erasure claim.
  with deleted as (
    delete from consultation_submissions
    where business_id = p_business_id and customer_id = p_customer_id
    returning 1
  )
  select count(*) into v_consultations_deleted from deleted;

  if v_name is not null and v_name <> '' then
    with deleted as (
      delete from notifications
      where business_id = p_business_id
        and (title = 'New booking: ' || v_name or title = 'Booking cancelled: ' || v_name)
      returning 1
    )
    select count(*) into v_notifications_deleted from deleted;
  else
    v_notifications_deleted := 0;
  end if;

  with scrubbed as (
    update bookings
    set customer_name = 'Deleted customer', customer_email = null,
        customer_phone = null, notes = null
    where customer_id = p_customer_id
    returning id
  )
  select count(*) into v_bookings_scrubbed from scrubbed;

  with scrubbed as (
    update payments
    set customer_name = 'Deleted customer', customer_email = null
    where booking_id in (select id from bookings where customer_id = p_customer_id)
    returning id
  )
  select count(*) into v_payments_scrubbed from scrubbed;

  update customers
  set name = 'Deleted customer', email = null, phone = null, address = null,
      notes = null, avatar_url = null, auth_user_id = null,
      stripe_customer_id = null, external_id = null
  where id = p_customer_id;

  update customer_data_requests
  set status = 'completed', resolved_at = now(), resolved_by = p_resolved_by
  where id = p_request_id and business_id = p_business_id;

  return jsonb_build_object(
    'bookings_scrubbed', v_bookings_scrubbed,
    'payments_scrubbed', v_payments_scrubbed,
    'notifications_deleted', v_notifications_deleted,
    'consultations_deleted', v_consultations_deleted,
    'other_business_has_live_email', v_other_business_has_live_email,
    'had_email', v_email is not null
  );
end;
$$;

revoke all on function public.erase_customer(uuid,uuid,uuid,uuid) from public;
revoke all on function public.erase_customer(uuid,uuid,uuid,uuid) from anon, authenticated;
grant execute on function public.erase_customer(uuid,uuid,uuid,uuid) to service_role;
