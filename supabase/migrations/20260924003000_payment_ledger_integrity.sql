create or replace function public.redeem_gift_card(p_business_id uuid,p_booking_id uuid,p_code_hash text,p_initiated_by_user_id uuid,p_idempotency_key text)
returns table(gift_card_id uuid,amount_cents integer,balance_cents integer)
language plpgsql security definer set search_path=public as $$
declare card gift_cards%rowtype;booking bookings%rowtype;previous gift_card_transactions%rowtype;
 amount integer;remaining integer;paid integer;expected_currency text;
begin
 if nullif(p_idempotency_key,'') is null or length(p_idempotency_key)>200 or p_code_hash is null or p_code_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid redemption identity';end if;
 perform pg_advisory_xact_lock(hashtext('gift-redemption:'||p_business_id::text||':'||p_idempotency_key));
 perform pg_advisory_xact_lock(hashtext('balance:'||p_booking_id::text));
 select * into previous from gift_card_transactions t where t.business_id=p_business_id and t.idempotency_key=p_idempotency_key;
 if found then
  if previous.type<>'redemption' or previous.booking_id is distinct from p_booking_id
   or previous.initiated_by_user_id is distinct from p_initiated_by_user_id
   or not exists(select 1 from gift_cards c where c.id=previous.gift_card_id and c.business_id=p_business_id and c.code_hash=p_code_hash) then
   raise exception 'Gift redemption identity mismatch';end if;
  gift_card_id:=previous.gift_card_id;amount_cents:=-previous.amount_cents;balance_cents:=previous.balance_after_cents;return next;return;
 end if;
 select lower(currency) into expected_currency from businesses where id=p_business_id and deletion_requested_at is null;
 if not found then raise exception 'This business is unavailable';end if;
 select * into card from gift_cards c where c.business_id=p_business_id and c.code_hash=p_code_hash for update;
 if not found then raise exception 'Gift card not found';end if;
 if card.status<>'active' or card.balance_cents<=0 then raise exception 'Gift card has no available balance';end if;
 if card.expires_at is not null and card.expires_at<=now() then raise exception 'Gift card has expired';end if;
 if card.currency is distinct from expected_currency then raise exception 'Gift card currency requires review';end if;
 select * into booking from bookings where id=p_booking_id and business_id=p_business_id for update;
 if not found then raise exception 'Booking not found';end if;
 if booking.status='cancelled' or booking.amount_refunded_cents>0 or booking.payment_status in('refunded','partially_refunded') then raise exception 'This booking needs payment review';end if;
 if exists(select 1 from payments where booking_id=booking.id and type='charge' and status='succeeded' and lower(currency)<>card.currency) then raise exception 'Booking currency requires review';end if;
 if exists(select 1 from balance_checkout_attempts where booking_id=booking.id and state in('active','review')) then raise exception 'The existing balance checkout needs review before another payment method';end if;
 amount:=least(card.balance_cents,greatest(0,booking.price_cents-booking.amount_paid_cents));
 if amount is null or amount<=0 then raise exception 'Booking is already paid in full';end if;
 remaining:=card.balance_cents-amount;paid:=booking.amount_paid_cents+amount;
 update gift_cards set balance_cents=remaining,status=case when remaining=0 then 'redeemed' else 'active' end,updated_at=now() where id=card.id;
 update bookings set amount_paid_cents=paid,amount_due_cents=greatest(0,price_cents-paid),payment_status=case when paid>=price_cents then 'paid' else 'deposit_paid' end where id=booking.id;
 insert into gift_card_transactions(business_id,gift_card_id,booking_id,type,amount_cents,balance_after_cents,idempotency_key,note,initiated_by_user_id)
 values(p_business_id,card.id,booking.id,'redemption',-amount,remaining,p_idempotency_key,'Applied to booking',p_initiated_by_user_id);
 gift_card_id:=card.id;amount_cents:=amount;balance_cents:=remaining;return next;
end;$$;

-- Accept confirmed partial refunds as well as full refunds; never apply the
-- same provider refund twice or to a different payment/booking/currency.
create or replace function public.fulfill_stripe_refund(p_business_id uuid,p_booking_id uuid,p_amount_cents integer,p_currency text,p_stripe_refund_id text,p_stripe_payment_intent_id text,p_initiated_by_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare booking bookings%rowtype;charge payments%rowtype;previous payments%rowtype;refunded integer;total integer;
begin
 if p_amount_cents is null or p_amount_cents<=0 or nullif(p_currency,'') is null or nullif(p_stripe_refund_id,'') is null or nullif(p_stripe_payment_intent_id,'') is null then raise exception 'Invalid refund';end if;
 perform pg_advisory_xact_lock(hashtext('balance:'||p_booking_id::text));
 perform pg_advisory_xact_lock(hashtext('payment:'||p_stripe_payment_intent_id));
 perform pg_advisory_xact_lock(hashtext('refund:'||p_stripe_refund_id));
 select * into previous from payments where stripe_refund_id=p_stripe_refund_id;
 if found then
  if previous.business_id is distinct from p_business_id or previous.booking_id is distinct from p_booking_id
   or previous.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id or previous.amount_cents is distinct from p_amount_cents
   or lower(previous.currency) is distinct from lower(p_currency) or previous.type<>'refund' or previous.status<>'succeeded' then
   raise exception 'Refund identity mismatch';end if;
  return p_booking_id;
 end if;
 select * into charge from payments where booking_id=p_booking_id and business_id=p_business_id and type='charge' and status='succeeded' and stripe_payment_intent_id=p_stripe_payment_intent_id;
 if not found then raise exception 'No matching succeeded charge for this refund';end if;
 if lower(p_currency) is distinct from lower(charge.currency) then raise exception 'Refund currency mismatch';end if;
 select coalesce(sum(amount_cents),0)::integer into refunded from payments where business_id=p_business_id and booking_id=p_booking_id and stripe_payment_intent_id=p_stripe_payment_intent_id and type='refund' and status='succeeded';
 if p_amount_cents>charge.amount_cents-refunded then raise exception 'Unexpected Stripe refund amount';end if;
 select * into booking from bookings where id=p_booking_id and business_id=p_business_id for update;
 if not found then raise exception 'Booking not found for refund';end if;
 total:=booking.amount_refunded_cents+p_amount_cents;
 if total>booking.amount_paid_cents then raise exception 'Refund amount exceeds recorded payment';end if;
 update bookings set amount_refunded_cents=total,payment_status=case when total>=amount_paid_cents then 'refunded' else 'partially_refunded' end where id=booking.id;
 insert into payments(business_id,booking_id,stripe_payment_intent_id,stripe_refund_id,type,status,amount_cents,currency,customer_name,customer_email,description,initiated_by_user_id)
 values(p_business_id,p_booking_id,p_stripe_payment_intent_id,p_stripe_refund_id,'refund','succeeded',p_amount_cents,lower(p_currency),booking.customer_name,booking.customer_email,'Refund',p_initiated_by_user_id);
 return p_booking_id;
end;$$;
revoke all on function public.redeem_gift_card(uuid,uuid,text,uuid,text),public.fulfill_stripe_refund(uuid,uuid,integer,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.redeem_gift_card(uuid,uuid,text,uuid,text),public.fulfill_stripe_refund(uuid,uuid,integer,text,text,text,uuid) to service_role;
notify pgrst,'reload schema';
