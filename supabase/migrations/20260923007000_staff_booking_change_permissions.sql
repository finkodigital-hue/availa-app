-- A customer's cancellation deadline must not block authorised reception
-- staff from completing or managing today's appointments. RLS still decides
-- which rows each operator may change; provider identifiers stay protected.
create or replace function public.enforce_booking_change_window()
returns trigger language plpgsql security definer set search_path=public as $$
declare win integer;
begin
 if row(new.starts_at,new.ends_at,new.status) is not distinct from row(old.starts_at,old.ends_at,old.status) then return new;end if;
 if auth.role()='service_role' or public.is_business_owner(new.business_id)
  or public.has_business_permission(new.business_id,'calendar.manage')
  or public.salon_pro_permission(new.business_id,'salon_can_book_pros') then return new;end if;
 select cancellation_window_hours into win from businesses where id=new.business_id;
 if old.starts_at<now()+make_interval(hours=>coalesce(win,24)) then
  raise exception 'This booking is within the % hour cancellation window and can no longer be changed online. Please contact the business.',coalesce(win,24);
 end if;
 return new;
end;$$;

create or replace function public.enforce_cancellation_window()
returns trigger language plpgsql security definer set search_path=public as $$
declare win integer;
begin
 if new.status is distinct from 'cancelled' or old.status='cancelled' then return new;end if;
 if auth.role()='service_role' or public.is_business_owner(new.business_id)
  or public.has_business_permission(new.business_id,'calendar.manage')
  or public.salon_pro_permission(new.business_id,'salon_can_book_pros') then return new;end if;
 select cancellation_window_hours into win from businesses where id=new.business_id;
 if old.starts_at-now()<make_interval(hours=>coalesce(win,24)) then
  raise exception 'CANCEL_WINDOW: this booking is inside the cancellation window — contact the business to cancel';
 end if;
 return new;
end;$$;
revoke all on function public.enforce_booking_change_window(),public.enforce_cancellation_window() from public,anon,authenticated;
notify pgrst,'reload schema';
