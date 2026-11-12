-- Claiming an email link and changing its booking are one transaction. Match
-- reschedule's booking-then-token lock order so a concurrent move invalidates
-- the old link before it can confirm/cancel a changed appointment.
create or replace function public.apply_booking_action_token(p_token_hash text, p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t booking_action_tokens%rowtype; b bookings%rowtype;
  v_now timestamptz; v_window integer; v_details jsonb;
begin
  if p_action not in ('confirm','cancel') or p_action is null
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  select * into t from booking_action_tokens where token_hash=p_token_hash and action=p_action;
  if not found then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  select * into b from bookings where id=t.booking_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  select * into t from booking_action_tokens where id=t.id for update;
  if not found then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  v_now:=clock_timestamp();
  if t.used_at is not null then return jsonb_build_object('ok',false,'reason','used'); end if;
  if t.expires_at<=v_now then return jsonb_build_object('ok',false,'reason','expired'); end if;

  -- Only receipt fields already shown by the public action page are returned.
  -- Construct them in this transaction; a later metadata fetch must not turn
  -- a completed mutation into an apparent failure with a spent link.
  select coalesce(biz.cancellation_window_hours,24),jsonb_build_object(
    'businessName',biz.name,'theme',biz.page_theme,
    'serviceName',coalesce(s.name,'Appointment'),'staffName',coalesce(st.name,'the team'),
    'startsAtIso',b.starts_at,'timezone',coalesce(nullif(biz.timezone,''),'UTC'),
    'priceCents',coalesce(b.price_cents,0),'currency',coalesce(nullif(biz.currency,''),'GBP'),
    'location',biz.address,'contactPhone',biz.phone,'contactEmail',biz.email
  ) into v_window,v_details
  from businesses biz left join services s on s.id=b.service_id
    left join staff st on st.id=b.staff_id where biz.id=b.business_id;
  if not found then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  if b.status='cancelled' then
    return v_details||jsonb_build_object('ok',false,'reason','already_cancelled');
  end if;
  if b.status not in ('pending','confirmed') or b.starts_at<=v_now then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if p_action='cancel' and b.starts_at<v_now+make_interval(hours=>v_window) then
    return v_details||jsonb_build_object('ok',false,'reason','window_passed','windowHours',v_window);
  end if;

  if p_action='confirm' then
    update bookings set client_confirmed_at=coalesce(client_confirmed_at,v_now) where id=b.id;
  else
    update bookings set status='cancelled' where id=b.id;
  end if;
  update booking_action_tokens set used_at=v_now where id=t.id;
  return v_details||jsonb_build_object('ok',true,'action',p_action,'bookingId',b.id);
  -- Deliberately allow database errors to propagate. PostgreSQL rolls back
  -- both writes, and the API returns a retryable failure rather than success.
end;
$$;
revoke all on function public.apply_booking_action_token(text,text) from public,anon,authenticated;
grant execute on function public.apply_booking_action_token(text,text) to service_role;
notify pgrst,'reload schema';
