-- Calendar drag-to-reschedule and resize (calendar.tsx: dropMove, resizeBooking,
-- and both their Undo handlers) currently do raw supabase.from("bookings")
-- .update() calls straight from the client — no conflict check at any layer,
-- client or server. isMoveAllowed only checks staff working-hours and
-- blocked_dates; it never queries other bookings. This is worse than the
-- staff-side creation gap fixed earlier today (that at least had a client-side
-- non-offering behavior) — dragging one booking directly onto another
-- succeeds silently, every time.
--
-- reschedule_booking (20260724160000) doesn't fit here: it assumes duration is
-- preserved (new_ends_at = new_starts_at + existing duration), which breaks
-- resize (which changes only one edge), and it has no staff-reassignment
-- parameter, which drag-to-a-different-column needs. Hence a distinct RPC.
create or replace function public.move_booking(
  p_booking_id uuid,
  p_new_starts_at timestamptz,
  p_new_ends_at timestamptz,
  p_new_staff_id uuid default null
) returns void
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_current_staff_id uuid;
  v_gap_min integer;
  v_active_after_min integer;
  v_target_staff_id uuid;
begin
  if p_new_ends_at <= p_new_starts_at then
    raise exception 'Invalid booking window';
  end if;

  select staff_id, gap_min, active_after_min
    into v_current_staff_id, v_gap_min, v_active_after_min
  from bookings where id = p_booking_id;

  if v_current_staff_id is null then
    raise exception 'Booking not found';
  end if;

  -- p_new_staff_id defaults to null, meaning "unchanged" (the resize case,
  -- and the plain vertical-drag-within-a-column case) — resolve to whichever
  -- staff member actually ends up owning the slot being checked, since a
  -- cross-column drag must lock and check against the DESTINATION staff's
  -- schedule, not the booking's current one.
  v_target_staff_id := coalesce(p_new_staff_id, v_current_staff_id);

  -- Checks the MOVING booking's own segment shape (its own gap_min /
  -- active_after_min, if it's a gap-booking being dragged) against the target
  -- staff's other bookings, excluding itself. Same shared, race-safe,
  -- segment-aware function as every other write path.
  perform public.assert_no_booking_conflict(
    v_target_staff_id, p_new_starts_at, p_new_ends_at, v_gap_min, v_active_after_min, p_booking_id
  );

  update bookings
     set staff_id = v_target_staff_id,
         starts_at = p_new_starts_at,
         ends_at = p_new_ends_at
   where id = p_booking_id;
end;
$function$;

-- SECURITY INVOKER: existing RLS policies (owner manages bookings / salon
-- updates pro bookings) keep governing who is allowed to move what and onto
-- which staff member — this adds the missing conflict check on top, it does
-- not change authorization. The client-side "same business calendar" guard
-- in dropMove is unchanged and still the place that check lives.
grant execute on function public.move_booking(uuid, timestamptz, timestamptz, uuid) to authenticated;
