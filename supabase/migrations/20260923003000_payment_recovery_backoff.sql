alter table public.booking_payment_issues
 add column last_checked_at timestamptz,
 add column next_attempt_at timestamptz not null default now(),
 add column manual_review boolean not null default false;

create or replace function public.claim_booking_payment_refund(p_payment_intent_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare issue booking_payment_issues%rowtype;
begin
 perform pg_advisory_xact_lock(hashtext('payment:'||p_payment_intent_id));
 select * into issue from booking_payment_issues where payment_intent_id=p_payment_intent_id for update;
 if not found or issue.status not in('open','refund_pending') or issue.hold_id is null
    or issue.created_at>now()-interval '15 minutes' or issue.next_attempt_at>now() or issue.manual_review then return null;end if;
 if exists(select 1 from bookings where stripe_payment_intent_id=p_payment_intent_id) then
  update booking_payment_issues set status='resolved',resolved_at=now() where payment_intent_id=p_payment_intent_id;return null;
 end if;
 update booking_payment_issues set status='refund_pending',last_checked_at=now(),next_attempt_at=now()+interval '15 minutes'
  where payment_intent_id=p_payment_intent_id;
 return to_jsonb(issue);
end;$$;
notify pgrst,'reload schema';
