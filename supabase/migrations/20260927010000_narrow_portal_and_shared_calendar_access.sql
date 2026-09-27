-- Customer portal and linked-calendar users must not receive whole base-table
-- rows containing internal notes, provider identifiers or other private fields.

drop policy if exists "authenticated read permitted bookings" on public.bookings;
create policy "authenticated read permitted bookings"
  on public.bookings for select to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  );

drop policy if exists "authenticated insert permitted bookings" on public.bookings;
create policy "authenticated insert permitted bookings"
  on public.bookings for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  );

drop policy if exists "authenticated update permitted bookings" on public.bookings;
create policy "authenticated update permitted bookings"
  on public.bookings for update to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  )
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  );

drop policy if exists "authenticated read permitted customers" on public.customers;
create policy "authenticated read permitted customers"
  on public.customers for select to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'customers.manage')
  );

drop policy if exists "authenticated update permitted customers" on public.customers;
create policy "authenticated update permitted customers"
  on public.customers for update to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'customers.manage')
  )
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'customers.manage')
  );

-- Disable whole-row linked-business reads pending narrow calendar RPCs.
drop policy if exists "authenticated read permitted blocked dates" on public.blocked_dates;
create policy "authenticated read permitted blocked dates"
  on public.blocked_dates for select to authenticated
  using (
    public.is_business_member(business_id)
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  );

drop policy if exists "authenticated read permitted businesses" on public.businesses;
create policy "authenticated read permitted businesses"
  on public.businesses for select to authenticated
  using (public.is_business_member(id) or (select auth.uid()) = owner_id);

drop policy if exists "authenticated read permitted staff" on public.staff;
create policy "authenticated read permitted staff"
  on public.staff for select to authenticated
  using (
    public.is_business_member(business_id)
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );

drop function if exists public.get_portal_bookings();
create function public.get_portal_bookings()
returns table(
  id uuid, business_id uuid, service_id uuid, staff_id uuid,
  customer_email text, starts_at timestamptz, ends_at timestamptz,
  status text, price_cents integer, businesses jsonb,
  services jsonb, staff jsonb
)
language plpgsql stable security definer set search_path=public as $$
begin
  perform public.check_request_assurance();
  if exists(select 1 from bookings b join customers c on c.id=b.customer_id where c.auth_user_id=auth.uid())
     and not exists(
       select 1 from bookings b join customers c on c.id=b.customer_id
       join businesses biz on biz.id=b.business_id
       where c.auth_user_id=auth.uid() and biz.plan='studio'
     ) then
    raise exception 'This feature is on the Studio plan.';
  end if;
  return query
  select b.id,b.business_id,b.service_id,b.staff_id,b.customer_email,
    b.starts_at,b.ends_at,b.status,b.price_cents,
    jsonb_build_object('id',biz.id,'name',biz.name,'slug',biz.slug,'address',biz.address,
      'page_theme',biz.page_theme,'cancellation_window_hours',biz.cancellation_window_hours),
    jsonb_build_object('id',sv.id,'name',sv.name,'duration_minutes',sv.duration_minutes,
      'gap_min',sv.gap_min,'active_after_min',sv.active_after_min),
    jsonb_build_object('id',st.id,'name',st.name)
  from bookings b join customers c on c.id=b.customer_id
  join businesses biz on biz.id=b.business_id and biz.plan='studio'
  left join services sv on sv.id=b.service_id left join staff st on st.id=b.staff_id
  where c.auth_user_id=auth.uid() order by b.starts_at desc limit 200;
end;$$;
revoke all on function public.get_portal_bookings() from public, anon;
grant execute on function public.get_portal_bookings() to authenticated;

create or replace function public.cancel_portal_booking(_booking_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.check_request_assurance();
  update public.bookings b set status='cancelled'
  where b.id=_booking_id and public.is_current_customer(b.customer_id);
  if not found then raise exception 'Booking not found'; end if;
end;$$;
revoke all on function public.cancel_portal_booking(uuid) from public, anon;
grant execute on function public.cancel_portal_booking(uuid) to authenticated;

create or replace function public.update_portal_customer_profile(
  _name text,
  _phone text
)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  perform public.check_request_assurance();
  if nullif(trim(_name),'') is null then raise exception 'Name is required'; end if;
  if length(trim(_name)) > 200 or length(coalesce(trim(_phone),'')) > 50 then
    raise exception 'Profile details are too long';
  end if;
  update public.customers
    set name=trim(_name), phone=nullif(trim(_phone),'')
    where auth_user_id=auth.uid();
  get diagnostics v_count=row_count;
  return v_count;
end;$$;
revoke all on function public.update_portal_customer_profile(text,text)
  from public, anon;
grant execute on function public.update_portal_customer_profile(text,text)
  to authenticated;
