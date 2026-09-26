alter table public.payments add column payment_method text not null default 'card'
  check (payment_method in ('card', 'cash'));

-- Same balance lock as Stripe and gift cards; ledger and booking commit together.
create function public.record_cash_payment(p_business_id uuid, p_booking_id uuid,
  p_amount_cents integer, p_currency text, p_request_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b businesses%rowtype; bk bookings%rowtype; previous payments%rowtype;
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_request_id is null then
    raise exception 'Invalid cash payment';
  end if;
  select * into b from businesses where id=p_business_id and owner_id=p_user_id and deletion_requested_at is null;
  if not found then raise exception 'Only the business owner can record cash payments'; end if;
  perform pg_advisory_xact_lock(hashtext('cash:'||p_request_id::text));
  perform pg_advisory_xact_lock(hashtext('balance:'||p_booking_id::text));
  select * into bk from bookings where id=p_booking_id and business_id=b.id for update;
  if not found then raise exception 'Booking not found'; end if;
  select * into previous from payments where id=p_request_id;
  if found then
    if previous.business_id is distinct from b.id or previous.booking_id is distinct from bk.id
      or previous.amount_cents is distinct from p_amount_cents or previous.currency is distinct from lower(p_currency)
      or previous.initiated_by_user_id is distinct from p_user_id or previous.payment_method<>'cash' then
      raise exception 'Cash payment identity mismatch';
    end if;
    return to_jsonb(bk);
  end if;
  if bk.status='cancelled' or bk.amount_refunded_cents>0 or bk.payment_status in ('refunded','partially_refunded') then
    raise exception 'This booking needs payment review';
  end if;
  if lower(p_currency) is distinct from lower(b.currency) or exists (
    select 1 from payments where booking_id=bk.id and type='charge' and status='succeeded' and lower(currency)<>lower(b.currency)
  ) then raise exception 'Booking currency has changed. Reopen the booking before taking payment'; end if;
  if exists (select 1 from balance_checkout_attempts where booking_id=bk.id and state in ('active','review')) then
    raise exception 'An existing card checkout must be resolved before recording cash. Check the card payment status first';
  end if;
  if p_amount_cents is distinct from (bk.price_cents-bk.amount_paid_cents) then
    raise exception 'The balance has changed. Reopen the booking to check the amount due';
  end if;
  insert into payments(id,business_id,booking_id,type,status,amount_cents,currency,payment_method,customer_name,customer_email,description,initiated_by_user_id)
    values(p_request_id,b.id,bk.id,'charge','succeeded',p_amount_cents,lower(b.currency),'cash',bk.customer_name,bk.customer_email,'Cash received in salon',p_user_id);
  update bookings set amount_paid_cents=price_cents,amount_due_cents=0,payment_status='paid' where id=bk.id returning * into bk;
  return to_jsonb(bk);
end;$$;
revoke all on function public.record_cash_payment(uuid,uuid,integer,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_cash_payment(uuid,uuid,integer,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
