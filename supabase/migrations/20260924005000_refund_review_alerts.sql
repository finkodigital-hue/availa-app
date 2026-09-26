-- Keep adverse refund notifications visible until an operator reconciles them.
-- Do not automatically recharge a customer, reinstate gift value or reverse a
-- booking ledger from a potentially delayed provider notification.
create table public.stripe_refund_reviews (
 stripe_refund_id text primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 stripe_payment_intent_id text not null,
 provider_status text not null check(provider_status in('failed','canceled','requires_action')),
 manual_review boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.stripe_refund_reviews enable row level security;
revoke all on public.stripe_refund_reviews from public,anon,authenticated;
grant select on public.stripe_refund_reviews to authenticated;
grant all on public.stripe_refund_reviews to service_role;
create policy "Owners can read refund reviews" on public.stripe_refund_reviews for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()));

create or replace function public.record_stripe_refund_review(p_business_id uuid,p_stripe_payment_intent_id text,p_stripe_refund_id text,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare previous stripe_refund_reviews%rowtype;
begin
 if nullif(p_stripe_refund_id,'') is null or nullif(p_stripe_payment_intent_id,'') is null or p_status is null or p_status not in('failed','canceled','requires_action') then raise exception 'Invalid refund review';end if;
 if not exists(select 1 from payments where business_id=p_business_id and stripe_payment_intent_id=p_stripe_payment_intent_id and type='charge' and status='succeeded')
 and not exists(select 1 from gift_cards where business_id=p_business_id and stripe_payment_intent_id=p_stripe_payment_intent_id and source='stripe_purchase') then
  raise exception 'Refund purchase is not yet reconciled';
 end if;
 perform pg_advisory_xact_lock(hashtext('refund-review:'||p_stripe_refund_id));
 select * into previous from stripe_refund_reviews where stripe_refund_id=p_stripe_refund_id;
 if found and (previous.business_id is distinct from p_business_id or previous.stripe_payment_intent_id is distinct from p_stripe_payment_intent_id) then raise exception 'Refund review identity mismatch';end if;
 insert into stripe_refund_reviews(stripe_refund_id,business_id,stripe_payment_intent_id,provider_status)
 values(p_stripe_refund_id,p_business_id,p_stripe_payment_intent_id,p_status)
 on conflict(stripe_refund_id) do update set provider_status=excluded.provider_status,manual_review=true,updated_at=now();
end;$$;
revoke all on function public.record_stripe_refund_review(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_stripe_refund_review(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
