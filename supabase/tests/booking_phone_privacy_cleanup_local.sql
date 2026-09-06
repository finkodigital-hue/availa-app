begin;

select plan(1);

-- Prepare a historical fake booking as its owner, then exercise the trigger as
-- an ordinary authenticated non-owner. The privacy-only clear must work while
-- another change to the same protected booking must remain blocked.
select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text
     from public.businesses
    where id = '21000000-0000-0000-0000-000000000001'),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.bookings
   set customer_phone = '+440000000000'
 where id = '61000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '99000000-0000-0000-0000-000000000001', true);

do $$
declare
  protected_change_blocked boolean := false;
begin
  update public.bookings
     set customer_phone = null
   where id = '61000000-0000-0000-0000-000000000001';

  if (select customer_phone
        from public.bookings
       where id = '61000000-0000-0000-0000-000000000001') is not null then
    raise exception 'privacy-only phone cleanup was not applied';
  end if;

  begin
    update public.bookings
       set notes = coalesce(notes, '') || ' forbidden change'
     where id = '61000000-0000-0000-0000-000000000001';
  exception
    when others then
      if sqlerrm like 'This booking is within the % cancellation window%' then
        protected_change_blocked := true;
      else
        raise;
      end if;
  end;

  if not protected_change_blocked then
    raise exception 'non-privacy booking change bypassed the cancellation window';
  end if;
end;
$$;

select pass('phone privacy cleanup is allowed without weakening booking-change protection');
select * from finish();

rollback;
