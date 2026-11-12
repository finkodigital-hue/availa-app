-- Customers use a narrow RPC after direct booking-row access was removed.
-- Do not restore SELECT/UPDATE grants or change the staff reschedule function.
create or replace function public.reschedule_portal_booking(
  p_booking_id uuid,p_new_starts_at timestamptz
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b bookings%rowtype; v_end timestamptz; v_window integer;
begin
  perform public.check_request_assurance();
  if auth.uid() is null or p_new_starts_at is null then
    raise exception 'Booking not found';
  end if;
  select * into b from bookings
    where id=p_booking_id and public.is_current_customer(customer_id) for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status<>'confirmed' then raise exception 'Only confirmed bookings can be rescheduled'; end if;
  select coalesce(cancellation_window_hours,24) into v_window from businesses where id=b.business_id;
  if b.starts_at<=clock_timestamp() or b.starts_at<clock_timestamp()+make_interval(hours=>v_window) then
    raise exception 'This booking is inside the cancellation window; contact the business';
  end if;
  v_end:=public.validate_public_booking_slot(b.business_id,b.service_id,b.staff_id,p_new_starts_at,b.id);
  if v_end-p_new_starts_at is distinct from b.ends_at-b.starts_at or exists(
    select 1 from services where id=b.service_id and
      (gap_min is distinct from b.gap_min or active_after_min is distinct from b.active_after_min)
  ) then raise exception 'The service has changed; contact the business to reschedule'; end if;
  -- Existing conflict lock, protected customer-update marker and notification
  -- triggers execute inside this transaction with the validated customer UID.
  perform public.reschedule_booking(b.id,p_new_starts_at);
end;$$;
revoke all on function public.reschedule_portal_booking(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.reschedule_portal_booking(uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
