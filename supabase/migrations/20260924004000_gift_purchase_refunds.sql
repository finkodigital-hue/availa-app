-- Provider-confirmed gift refunds remove unspent value atomically. A refund
-- against already-spent credit is retained for review, never silently lost.
create table public.gift_card_refunds (
 stripe_refund_id text primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 gift_card_id uuid not null references public.gift_cards(id),
 stripe_payment_intent_id text not null,
 amount_cents integer not null check(amount_cents>0),
 currency text not null check(currency ~ '^[a-z]{3}$'),
 removed_credit_cents integer not null check(removed_credit_cents>=0 and removed_credit_cents<=amount_cents),
 manual_review boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.gift_card_refunds enable row level security;
revoke all on public.gift_card_refunds from public,anon,authenticated;
grant select on public.gift_card_refunds to authenticated;
grant all on public.gift_card_refunds to service_role;
create policy "Owners can view gift refunds" on public.gift_card_refunds for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()));

create or replace function public.fulfill_gift_card_refund(p_business_id uuid,p_stripe_payment_intent_id text,p_stripe_refund_id text,p_amount_cents integer,p_currency text)
returns uuid language plpgsql security definer set search_path=public as $$
declare card gift_cards%rowtype;previous gift_card_refunds%rowtype;refunded integer;removed integer;remaining integer;
begin
 if p_amount_cents is null or p_amount_cents<=0 or nullif(p_currency,'') is null or nullif(p_stripe_refund_id,'') is null or nullif(p_stripe_payment_intent_id,'') is null then raise exception 'Invalid gift refund';end if;
 perform pg_advisory_xact_lock(hashtext('gift-refund:'||p_stripe_refund_id));
 select * into previous from gift_card_refunds where stripe_refund_id=p_stripe_refund_id;
 if found then
  if previous.business_id is distinct from p_business_id or previous.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id or previous.amount_cents is distinct from p_amount_cents or previous.currency is distinct from lower(p_currency) then raise exception 'Gift refund identity mismatch';end if;
  return previous.gift_card_id;
 end if;
 select * into card from gift_cards where business_id=p_business_id and stripe_payment_intent_id=p_stripe_payment_intent_id and source='stripe_purchase' for update;
 if not found then raise exception 'Gift purchase is not yet reconciled';end if;
 if card.currency is distinct from lower(p_currency) then raise exception 'Gift refund currency mismatch';end if;
 select coalesce(sum(amount_cents),0)::integer into refunded from gift_card_refunds where gift_card_id=card.id;
 if refunded+p_amount_cents>card.initial_balance_cents then raise exception 'Gift refund exceeds purchase';end if;
 removed:=least(card.balance_cents,p_amount_cents);remaining:=card.balance_cents-removed;
 update gift_cards set balance_cents=remaining,status=case when remaining=0 then 'void' else status end,updated_at=now() where id=card.id;
 insert into gift_card_refunds(stripe_refund_id,business_id,gift_card_id,stripe_payment_intent_id,amount_cents,currency,removed_credit_cents,manual_review)
 values(p_stripe_refund_id,p_business_id,card.id,p_stripe_payment_intent_id,p_amount_cents,lower(p_currency),removed,removed<p_amount_cents);
 if removed>0 then
  insert into gift_card_transactions(business_id,gift_card_id,type,amount_cents,balance_after_cents,idempotency_key,note)
  values(p_business_id,card.id,'void',-removed,remaining,'refund:'||p_stripe_refund_id,'Credit removed after confirmed Stripe purchase refund');
 end if;
 return card.id;
end;$$;
revoke all on function public.fulfill_gift_card_refund(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.fulfill_gift_card_refund(uuid,text,text,integer,text) to service_role;
notify pgrst,'reload schema';
