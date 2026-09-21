-- A failed slot selection must not spend the customer's email link.
create or replace function public.reschedule_booking_with_token(p_token_hash text,p_new_starts_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t booking_action_tokens%rowtype;b bookings%rowtype;v_end timestamptz;v_window integer;
begin
  select * into t from booking_action_tokens where token_hash=p_token_hash and action='reschedule';
  if not found then return jsonb_build_object('ok',false,'reason','invalid');end if;
  select * into b from bookings where id=t.booking_id for update;
  if not found or b.status<>'confirmed' then return jsonb_build_object('ok',false,'reason','invalid');end if;
  select * into t from booking_action_tokens where id=t.id for update;
  if not found then return jsonb_build_object('ok',false,'reason','invalid');end if;
  if t.used_at is not null then return jsonb_build_object('ok',false,'reason','used');end if;
  if t.expires_at<=now() then return jsonb_build_object('ok',false,'reason','expired');end if;
  select coalesce(cancellation_window_hours,24) into v_window from businesses where id=b.business_id;
  if b.starts_at<now()+make_interval(hours=>v_window) then return jsonb_build_object('ok',false,'reason','window_passed');end if;
  v_end:=validate_public_booking_slot(b.business_id,b.service_id,b.staff_id,p_new_starts_at,b.id);
  -- Never silently change the service duration of an existing booking.
  if v_end-p_new_starts_at is distinct from b.ends_at-b.starts_at
     or exists(select 1 from services where id=b.service_id and (gap_min is distinct from b.gap_min or active_after_min is distinct from b.active_after_min)) then
    return jsonb_build_object('ok',false,'reason','service_changed');
  end if;
  perform reschedule_booking(b.id,p_new_starts_at);
  update booking_action_tokens set used_at=now() where id=t.id;
  return jsonb_build_object('ok',true);
exception when raise_exception then
  -- PL/pgSQL rolls back the whole block on an exception, including token use.
  if sqlerrm like '%SLOT_TAKEN%' then return jsonb_build_object('ok',false,'reason','slot_taken');end if;
  return jsonb_build_object('ok',false,'reason','invalid');
end;
$$;
revoke all on function public.reschedule_booking_with_token(text,timestamptz) from public,anon,authenticated;
grant execute on function public.reschedule_booking_with_token(text,timestamptz) to service_role;
notify pgrst,'reload schema';
