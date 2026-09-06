-- A customer contact number may need to be erased from historical booking
-- records for privacy reasons. The cancellation-window trigger previously
-- treated that privacy-only cleanup as if the appointment itself were being
-- changed, which blocked cleanup for past and near-term bookings.
--
-- Keep the cancellation protection intact for every other change. This narrow
-- exception permits only clearing customer_phone to NULL, with the rest of the
-- booking record remaining byte-for-byte equivalent.
create or replace function public.enforce_booking_change_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  win int;
begin
  if new.customer_phone is null
     and old.customer_phone is not null
     and (to_jsonb(new) - 'customer_phone') is not distinct from
         (to_jsonb(old) - 'customer_phone') then
    return new;
  end if;

  if auth.role() = 'service_role' or public.is_business_owner(new.business_id) then
    return new;
  end if;

  select cancellation_window_hours
    into win
    from public.businesses
   where id = new.business_id;

  if old.starts_at < (now() + make_interval(hours => coalesce(win, 24))) then
    raise exception 'This booking is within the % hour cancellation window and can no longer be changed online. Please contact the business.', coalesce(win, 24);
  end if;

  return new;
end;
$$;

