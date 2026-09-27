-- Consolidate overlapping permissive RLS policies without changing access.
-- PostgreSQL ORs permissive policies together. The policies below express that
-- same OR once per role and operation, avoiding repeated policy evaluation and
-- Supabase's `multiple_permissive_policies` performance warnings.

begin;

-- blocked_dates
drop policy if exists "members read blocked dates" on public.blocked_dates;
drop policy if exists "owner manages blocked" on public.blocked_dates;
drop policy if exists "permitted staff manage blocked dates" on public.blocked_dates;
drop policy if exists "salon reads linked pro blocks" on public.blocked_dates;

create policy "authenticated read permitted blocked dates"
  on public.blocked_dates for select to authenticated
  using (
    public.is_business_member(business_id)
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
    or private.salon_pro_permission(business_id, 'salon_can_view_calendar')
  );
create policy "authenticated insert permitted blocked dates"
  on public.blocked_dates for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  );
create policy "authenticated update permitted blocked dates"
  on public.blocked_dates for update to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  )
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  );
create policy "authenticated delete permitted blocked dates"
  on public.blocked_dates for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  );

-- bookings
drop policy if exists "Customers can update their bookings" on public.bookings;
drop policy if exists "Customers can view their bookings" on public.bookings;
drop policy if exists "owner manages bookings" on public.bookings;
drop policy if exists "permitted staff create bookings" on public.bookings;
drop policy if exists "permitted staff delete bookings" on public.bookings;
drop policy if exists "permitted staff manage bookings" on public.bookings;
drop policy if exists "permitted staff read bookings" on public.bookings;
drop policy if exists "permitted staff update bookings" on public.bookings;
drop policy if exists "practitioners read own bookings" on public.bookings;
drop policy if exists "salon inserts pro bookings" on public.bookings;
drop policy if exists "salon reads linked pro bookings" on public.bookings;
drop policy if exists "salon updates pro bookings" on public.bookings;

create policy "authenticated read permitted bookings"
  on public.bookings for select to authenticated
  using (
    public.is_current_customer(customer_id)
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
    or (
      public.has_business_permission(business_id, 'calendar.read')
      and staff_id = (
        select m.staff_id
        from public.staff_memberships m
        where m.business_id = bookings.business_id
          and m.user_id = (select auth.uid())
          and m.active
      )
    )
    or exists (
      select 1
      from public.staff_memberships m
      where m.user_id = (select auth.uid())
        and m.business_id = bookings.business_id
        and m.staff_id = bookings.staff_id
        and m.active
    )
    or private.salon_pro_permission(business_id, 'salon_can_view_calendar')
  );
create policy "authenticated insert permitted bookings"
  on public.bookings for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
    or private.salon_pro_permission(business_id, 'salon_can_book_pros')
  );
create policy "authenticated update permitted bookings"
  on public.bookings for update to authenticated
  using (
    public.is_current_customer(customer_id)
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
    or private.salon_pro_permission(business_id, 'salon_can_book_pros')
  )
  with check (
    public.is_current_customer(customer_id)
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
    or private.salon_pro_permission(business_id, 'salon_can_book_pros')
  );
create policy "authenticated delete permitted bookings"
  on public.bookings for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'calendar.manage')
  );

-- business_hour_periods. The original policies targeted PUBLIC, so keep that
-- scope while separating the owner mutations from the public read.
drop policy if exists "Owners manage periods" on public.business_hour_periods;
create policy "Owners insert periods"
  on public.business_hour_periods for insert to public
  with check (public.is_business_owner(business_id));
create policy "Owners update periods"
  on public.business_hour_periods for update to public
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));
create policy "Owners delete periods"
  on public.business_hour_periods for delete to public
  using (public.is_business_owner(business_id));

-- business_hours
drop policy if exists "members read business hours" on public.business_hours;
drop policy if exists "owner manages hours" on public.business_hours;
drop policy if exists "public reads hours authed" on public.business_hours;
drop policy if exists "staff managers manage business hours" on public.business_hours;
create policy "authenticated read business hours"
  on public.business_hours for select to authenticated using (true);
create policy "authenticated insert permitted business hours"
  on public.business_hours for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );
create policy "authenticated update permitted business hours"
  on public.business_hours for update to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  )
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );
create policy "authenticated delete permitted business hours"
  on public.business_hours for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );

-- business_media
drop policy if exists "owner manages media" on public.business_media;
create policy "owner inserts media"
  on public.business_media for insert to authenticated
  with check (public.is_business_owner(business_id));
create policy "owner updates media"
  on public.business_media for update to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));
create policy "owner deletes media"
  on public.business_media for delete to authenticated
  using (public.is_business_owner(business_id));

-- businesses
drop policy if exists "employees read their business" on public.businesses;
drop policy if exists "owner reads business" on public.businesses;
drop policy if exists "salon reads linked pro business" on public.businesses;
create policy "authenticated read permitted businesses"
  on public.businesses for select to authenticated
  using (
    public.is_business_member(id)
    or (select auth.uid()) = owner_id
    or private.is_salon_owner_of_pro(id)
  );

-- customers
drop policy if exists "Customers can update their own customer record" on public.customers;
drop policy if exists "Customers can view their own customer record" on public.customers;
drop policy if exists "owner manages customers" on public.customers;
drop policy if exists "permitted staff manage customers" on public.customers;
create policy "authenticated read permitted customers"
  on public.customers for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'customers.manage')
  );
create policy "authenticated insert permitted customers"
  on public.customers for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'customers.manage')
  );
create policy "authenticated update permitted customers"
  on public.customers for update to authenticated
  using (
    auth_user_id = (select auth.uid())
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'customers.manage')
  )
  with check (
    auth_user_id = (select auth.uid())
    or public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'customers.manage')
  );
create policy "authenticated delete permitted customers"
  on public.customers for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'customers.manage')
  );

-- holiday_closures
drop policy if exists "owner manages closures" on public.holiday_closures;
create policy "owner inserts closures"
  on public.holiday_closures for insert to authenticated
  with check (public.is_business_owner(business_id));
create policy "owner updates closures"
  on public.holiday_closures for update to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));
create policy "owner deletes closures"
  on public.holiday_closures for delete to authenticated
  using (public.is_business_owner(business_id));

-- inventory_items
drop policy if exists "inventory staff manage inventory" on public.inventory_items;
drop policy if exists "owner manages inventory" on public.inventory_items;
create policy "authenticated read permitted inventory"
  on public.inventory_items for select to authenticated
  using (
    business_id in (
      select b.id from public.businesses b
      where b.owner_id = (select auth.uid())
    )
    or public.has_business_permission(business_id, 'inventory.manage')
  );
create policy "authenticated insert permitted inventory"
  on public.inventory_items for insert to authenticated
  with check (
    business_id in (
      select b.id from public.businesses b
      where b.owner_id = (select auth.uid())
    )
    or public.has_business_permission(business_id, 'inventory.manage')
  );
create policy "authenticated update permitted inventory"
  on public.inventory_items for update to authenticated
  using (
    business_id in (
      select b.id from public.businesses b
      where b.owner_id = (select auth.uid())
    )
    or public.has_business_permission(business_id, 'inventory.manage')
  )
  with check (
    business_id in (
      select b.id from public.businesses b
      where b.owner_id = (select auth.uid())
    )
    or public.has_business_permission(business_id, 'inventory.manage')
  );
create policy "authenticated delete permitted inventory"
  on public.inventory_items for delete to authenticated
  using (
    business_id in (
      select b.id from public.businesses b
      where b.owner_id = (select auth.uid())
    )
    or public.has_business_permission(business_id, 'inventory.manage')
  );

-- page_layouts
drop policy if exists "owner reads own page layout" on public.page_layouts;
-- Authenticated public booking customers could already read every layout; that
-- true predicate subsumes the owner SELECT condition exactly.

-- profiles
drop policy if exists "own profile write" on public.profiles;
create policy "own profile insert"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "own profile update"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "own profile delete"
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

-- rent_payments
drop policy if exists "pro reads own rent" on public.rent_payments;
drop policy if exists "salon owner manages rent" on public.rent_payments;
create policy "owners read permitted rent payments"
  on public.rent_payments for select to authenticated
  using (
    exists (
      select 1 from public.salon_professionals sp
      where sp.id = rent_payments.salon_professional_id
        and public.is_business_owner(sp.pro_business_id)
    )
    or exists (
      select 1 from public.salon_professionals sp
      where sp.id = rent_payments.salon_professional_id
        and public.is_business_owner(sp.salon_business_id)
    )
  );
create policy "salon owner inserts rent payments"
  on public.rent_payments for insert to authenticated
  with check (
    exists (
      select 1 from public.salon_professionals sp
      where sp.id = rent_payments.salon_professional_id
        and public.is_business_owner(sp.salon_business_id)
    )
  );
create policy "salon owner updates rent payments"
  on public.rent_payments for update to authenticated
  using (
    exists (
      select 1 from public.salon_professionals sp
      where sp.id = rent_payments.salon_professional_id
        and public.is_business_owner(sp.salon_business_id)
    )
  )
  with check (
    exists (
      select 1 from public.salon_professionals sp
      where sp.id = rent_payments.salon_professional_id
        and public.is_business_owner(sp.salon_business_id)
    )
  );
create policy "salon owner deletes rent payments"
  on public.rent_payments for delete to authenticated
  using (
    exists (
      select 1 from public.salon_professionals sp
      where sp.id = rent_payments.salon_professional_id
        and public.is_business_owner(sp.salon_business_id)
    )
  );

-- salon_professionals
drop policy if exists "pro reads own link" on public.salon_professionals;
drop policy if exists "pro updates own link" on public.salon_professionals;
drop policy if exists "salon owner manages links" on public.salon_professionals;
create policy "owners read permitted professional links"
  on public.salon_professionals for select to authenticated
  using (
    public.is_business_owner(pro_business_id)
    or public.is_business_owner(salon_business_id)
  );
create policy "salon owners insert professional links"
  on public.salon_professionals for insert to authenticated
  with check (public.is_business_owner(salon_business_id));
create policy "owners update permitted professional links"
  on public.salon_professionals for update to authenticated
  using (
    public.is_business_owner(pro_business_id)
    or public.is_business_owner(salon_business_id)
  )
  with check (
    public.is_business_owner(pro_business_id)
    or public.is_business_owner(salon_business_id)
  );
create policy "salon owners delete professional links"
  on public.salon_professionals for delete to authenticated
  using (public.is_business_owner(salon_business_id));

-- service_staff
drop policy if exists "members read service staff" on public.service_staff;
drop policy if exists "owner manages svc_staff" on public.service_staff;
drop policy if exists "staff managers manage service staff" on public.service_staff;
-- The existing authenticated public-read policy remains the sole SELECT policy.
create policy "authenticated insert permitted service staff"
  on public.service_staff for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'services.manage')
  );
create policy "authenticated update permitted service staff"
  on public.service_staff for update to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'services.manage')
  )
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'services.manage')
  );
create policy "authenticated delete permitted service staff"
  on public.service_staff for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'services.manage')
  );

-- services
drop policy if exists "members read services" on public.services;
drop policy if exists "owner manages services" on public.services;
drop policy if exists "public can view active services authed" on public.services;
drop policy if exists "salon reads linked pro services" on public.services;
drop policy if exists "staff managers manage services" on public.services;
create policy "authenticated read permitted services"
  on public.services for select to authenticated
  using (
    public.is_business_member(business_id)
    or public.is_business_owner(business_id)
    or active = true
    or (
      active = true
      and private.salon_pro_permission(business_id, 'salon_can_view_calendar')
    )
    or public.has_business_permission(business_id, 'services.manage')
  );
create policy "authenticated insert permitted services"
  on public.services for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'services.manage')
  );
create policy "authenticated update permitted services"
  on public.services for update to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'services.manage')
  )
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'services.manage')
  );
create policy "authenticated delete permitted services"
  on public.services for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'services.manage')
  );

-- staff
drop policy if exists "members read staff" on public.staff;
drop policy if exists "owner manages staff" on public.staff;
drop policy if exists "salon reads linked pro staff" on public.staff;
drop policy if exists "staff managers manage staff" on public.staff;
create policy "authenticated read permitted staff"
  on public.staff for select to authenticated
  using (
    public.is_business_member(business_id)
    or public.is_business_owner(business_id)
    or (
      active = true
      and private.salon_pro_permission(business_id, 'salon_can_view_calendar')
    )
    or public.has_business_permission(business_id, 'staff.manage')
  );
create policy "authenticated insert permitted staff"
  on public.staff for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );
create policy "authenticated update permitted staff"
  on public.staff for update to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  )
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );
create policy "authenticated delete permitted staff"
  on public.staff for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );

-- staff_hours
drop policy if exists "owner manages staff_hours" on public.staff_hours;
drop policy if exists "staff managers manage staff hours" on public.staff_hours;
create policy "authenticated insert permitted staff hours"
  on public.staff_hours for insert to authenticated
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );
create policy "authenticated update permitted staff hours"
  on public.staff_hours for update to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  )
  with check (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );
create policy "authenticated delete permitted staff hours"
  on public.staff_hours for delete to authenticated
  using (
    public.is_business_owner(business_id)
    or public.has_business_permission(business_id, 'staff.manage')
  );

-- staff_memberships
drop policy if exists "owners manage memberships" on public.staff_memberships;
create policy "owners insert memberships"
  on public.staff_memberships for insert to authenticated
  with check (public.is_business_owner(business_id));
create policy "owners update memberships"
  on public.staff_memberships for update to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));
create policy "owners delete memberships"
  on public.staff_memberships for delete to authenticated
  using (public.is_business_owner(business_id));

commit;
