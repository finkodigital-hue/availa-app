-- Treat Stripe's identifiers and monetary fields as one immutable fulfilment
-- identity. SQL NULL comparison must never let a malformed/replayed provider
-- event mint a gift card or make a mismatched replay look successful.
create or replace function public.fulfill_gift_card_purchase(
  p_order_id uuid,
  p_business_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.gift_card_orders%rowtype;
  v_card_id uuid;
begin
  if p_order_id is null or p_business_id is null
     or p_amount_cents is null or p_amount_cents <= 0
     or p_currency is null or p_currency !~ '^[A-Za-z]{3}$'
     or nullif(trim(p_stripe_checkout_session_id), '') is null
     or nullif(trim(p_stripe_payment_intent_id), '') is null then
    raise exception 'Invalid gift card payment details';
  end if;

  select * into v_order
  from public.gift_card_orders
  where id = p_order_id and business_id = p_business_id
  for update;

  if not found then raise exception 'Gift card order not found'; end if;
  if v_order.amount_cents is distinct from p_amount_cents
     or v_order.currency is distinct from lower(p_currency) then
    raise exception 'Unexpected gift card purchase amount';
  end if;
  if v_order.stripe_checkout_session_id is null
     or v_order.stripe_checkout_session_id is distinct from trim(p_stripe_checkout_session_id) then
    raise exception 'Gift card checkout session mismatch';
  end if;

  if v_order.status = 'paid' then
    if v_order.stripe_payment_intent_id is distinct from trim(p_stripe_payment_intent_id) then
      raise exception 'Gift card order payment mismatch';
    end if;
    if v_order.gift_card_id is null then
      raise exception 'Paid gift card order is incomplete';
    end if;
    return v_order.gift_card_id;
  end if;

  if v_order.status <> 'pending' then raise exception 'Gift card order is not payable'; end if;

  insert into public.gift_cards (
    business_id, code_hash, code_hint, initial_balance_cents, balance_cents,
    currency, recipient_name, recipient_email, message, source,
    stripe_payment_intent_id
  ) values (
    v_order.business_id, v_order.code_hash, v_order.code_hint, v_order.amount_cents,
    v_order.amount_cents, v_order.currency, v_order.recipient_name,
    v_order.recipient_email, v_order.message, 'stripe_purchase',
    trim(p_stripe_payment_intent_id)
  )
  returning id into v_card_id;

  insert into public.gift_card_transactions (
    business_id, gift_card_id, type, amount_cents, balance_after_cents,
    idempotency_key, note
  ) values (
    v_order.business_id, v_card_id, 'purchase', v_order.amount_cents,
    v_order.amount_cents, 'stripe:' || trim(p_stripe_payment_intent_id),
    'Purchased through Stripe Checkout'
  );

  update public.gift_card_orders
  set status = 'paid', gift_card_id = v_card_id,
      stripe_payment_intent_id = trim(p_stripe_payment_intent_id), paid_at = now()
  where id = v_order.id;

  return v_card_id;
end;
$$;

revoke all on function public.fulfill_gift_card_purchase(uuid,uuid,integer,text,text,text)
  from public, anon, authenticated;
grant execute on function public.fulfill_gift_card_purchase(uuid,uuid,integer,text,text,text)
  to service_role;
