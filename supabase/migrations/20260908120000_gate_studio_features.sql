-- Studio feature boundaries. Existing rows are preserved when a workspace
-- downgrades; only access and new writes are refused.

create or replace function public.require_studio_business(p_business_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.businesses
    where id = p_business_id and plan = 'studio'
  ) then
    raise exception 'This feature is on the Studio plan.';
  end if;
end;
$$;

revoke all on function public.require_studio_business(uuid) from public, anon, authenticated;
grant execute on function public.require_studio_business(uuid) to service_role;

create or replace function public.enforce_studio_inventory_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.require_studio_business(old.business_id);
    return old;
  end if;
  perform public.require_studio_business(new.business_id);
  return new;
end;
$$;
revoke all on function public.enforce_studio_inventory_write() from public, anon, authenticated;

drop trigger if exists inventory_studio_write on public.inventory_items;
create trigger inventory_studio_write before insert or update or delete on public.inventory_items
for each row execute function public.enforce_studio_inventory_write();

drop trigger if exists service_recipe_studio_write on public.service_recipe_items;
create trigger service_recipe_studio_write before insert or update or delete on public.service_recipe_items
for each row execute function public.enforce_studio_inventory_write();

create or replace function public.enforce_professional_invitation_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_team_count integer;
begin
  select plan into v_plan from public.businesses where id = new.salon_business_id;

  if v_plan = 'free' then
    if (tg_op = 'INSERT' and (
      new.rent_mode <> 'none'
      or new.rent_amount_cents is not null
      or new.commission_percent is not null
      or new.agreement_start is not null
      or new.agreement_end is not null
      or new.rent_due_day is not null
    )) or (tg_op = 'UPDATE' and (
      new.rent_mode is distinct from old.rent_mode
      or new.rent_amount_cents is distinct from old.rent_amount_cents
      or new.commission_percent is distinct from old.commission_percent
      or new.agreement_start is distinct from old.agreement_start
      or new.agreement_end is distinct from old.agreement_end
      or new.rent_due_day is distinct from old.rent_due_day
    )) then
      raise exception 'This feature is on the Studio plan.';
    end if;

    if tg_op = 'INSERT' then
      select
        (select count(*) from public.staff where business_id = new.salon_business_id and archived_at is null)
        + (select count(*) from public.salon_professionals where salon_business_id = new.salon_business_id and status = 'active')
        + (select count(*) from public.professional_invitations where salon_business_id = new.salon_business_id and status = 'pending' and expires_at > now())
      into v_team_count;
      if v_team_count >= 1 then
        raise exception 'PLAN_LIMIT: The free plan is limited to one team member. Upgrade to Studio to add more.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_professional_invitation_plan() from public, anon, authenticated;

drop trigger if exists professional_invite_studio_write on public.professional_invitations;
create trigger professional_invite_studio_write before insert or update on public.professional_invitations
for each row execute function public.enforce_professional_invitation_plan();

create or replace function public.enforce_salon_professional_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_team_count integer;
begin
  select plan into v_plan from public.businesses where id = new.salon_business_id;

  if v_plan = 'free' then
    if (tg_op = 'INSERT' and (
      new.rent_mode <> 'none'
      or new.rent_amount_cents is not null
      or new.commission_percent is not null
      or new.agreement_start is not null
      or new.agreement_end is not null
      or new.rent_due_day is not null
    )) or (tg_op = 'UPDATE' and (
      new.rent_mode is distinct from old.rent_mode
      or new.rent_amount_cents is distinct from old.rent_amount_cents
      or new.commission_percent is distinct from old.commission_percent
      or new.agreement_start is distinct from old.agreement_start
      or new.agreement_end is distinct from old.agreement_end
      or new.rent_due_day is distinct from old.rent_due_day
    )) then
      raise exception 'This feature is on the Studio plan.';
    end if;

    if tg_op = 'INSERT' then
      select
        (select count(*) from public.staff where business_id = new.salon_business_id and archived_at is null)
        + (select count(*) from public.salon_professionals where salon_business_id = new.salon_business_id and status = 'active')
      into v_team_count;
      if v_team_count >= 1 then
        raise exception 'PLAN_LIMIT: The free plan is limited to one team member. Upgrade to Studio to add more.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_salon_professional_plan() from public, anon, authenticated;

drop trigger if exists salon_professional_studio_insert on public.salon_professionals;
create trigger salon_professional_studio_insert before insert or update on public.salon_professionals
for each row execute function public.enforce_salon_professional_plan();

create or replace function public.enforce_studio_rent_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
begin
  select salon_business_id into v_business_id from public.salon_professionals
  where id = case when tg_op = 'DELETE' then old.salon_professional_id else new.salon_professional_id end;
  perform public.require_studio_business(v_business_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.enforce_studio_rent_write() from public, anon, authenticated;

drop trigger if exists rent_payment_studio_write on public.rent_payments;
create trigger rent_payment_studio_write before insert or update or delete on public.rent_payments
for each row execute function public.enforce_studio_rent_write();

-- Keep the signed-in customer portal behind Studio at the database boundary too.
-- Owner/staff workflows and service-role booking-action links are deliberately
-- unaffected, so Free salons keep normal booking management and one-tap links.
create or replace function public.enforce_studio_customer_portal_booking_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated'
    and lower(old.customer_email) = public.current_user_email()
    and not exists (
      select 1 from public.businesses
      where id = old.business_id and owner_id = auth.uid()
    )
    and not public.is_linked_pro_of(old.business_id)
  then
    perform public.require_studio_business(old.business_id);
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_studio_customer_portal_booking_write() from public, anon, authenticated;

drop trigger if exists customer_portal_booking_studio_write on public.bookings;
create trigger customer_portal_booking_studio_write before update on public.bookings
for each row execute function public.enforce_studio_customer_portal_booking_write();

create or replace function public.enforce_studio_customer_portal_profile_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated'
    and lower(old.email) = public.current_user_email()
    and not exists (
      select 1 from public.businesses
      where id = old.business_id and owner_id = auth.uid()
    )
  then
    perform public.require_studio_business(old.business_id);
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_studio_customer_portal_profile_write() from public, anon, authenticated;

drop trigger if exists customer_portal_profile_studio_write on public.customers;
create trigger customer_portal_profile_studio_write before update on public.customers
for each row execute function public.enforce_studio_customer_portal_profile_write();

create or replace function public.get_portal_bookings()
returns table(
  id uuid, business_id uuid, service_id uuid, staff_id uuid,
  customer_email text, starts_at timestamptz, ends_at timestamptz,
  status text, price_cents int, notes text, businesses jsonb,
  services jsonb, staff jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.bookings b
    where lower(b.customer_email) = public.current_user_email()
  ) and not exists (
    select 1 from public.bookings b
    join public.businesses biz on biz.id = b.business_id
    where lower(b.customer_email) = public.current_user_email()
      and biz.plan = 'studio'
  ) then
    raise exception 'This feature is on the Studio plan.';
  end if;

  return query
  select
    b.id, b.business_id, b.service_id, b.staff_id, b.customer_email,
    b.starts_at, b.ends_at, b.status, b.price_cents, b.notes,
    jsonb_build_object(
      'id', biz.id, 'name', biz.name, 'slug', biz.slug, 'address', biz.address,
      'page_theme', biz.page_theme, 'cancellation_window_hours', biz.cancellation_window_hours
    ),
    jsonb_build_object('id', sv.id, 'name', sv.name, 'duration_minutes', sv.duration_minutes, 'gap_min', sv.gap_min, 'active_after_min', sv.active_after_min),
    jsonb_build_object('id', st.id, 'name', st.name)
  from public.bookings b
  join public.businesses biz on biz.id = b.business_id and biz.plan = 'studio'
  left join public.services sv on sv.id = b.service_id
  left join public.staff st on st.id = b.staff_id
  where lower(b.customer_email) = public.current_user_email()
  order by b.starts_at desc
  limit 200;
end;
$$;

create or replace function public.get_portal_customer_records()
returns table(id uuid, business_id uuid, name text, email text, phone text, businesses jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.customers c
    where lower(c.email) = public.current_user_email()
  ) and not exists (
    select 1 from public.customers c
    join public.businesses biz on biz.id = c.business_id
    where lower(c.email) = public.current_user_email()
      and biz.plan = 'studio'
  ) then
    raise exception 'This feature is on the Studio plan.';
  end if;

  return query
  select c.id, c.business_id, c.name, c.email, c.phone,
    jsonb_build_object('name', biz.name)
  from public.customers c
  join public.businesses biz on biz.id = c.business_id and biz.plan = 'studio'
  where lower(c.email) = public.current_user_email()
  order by c.created_at desc;
end;
$$;

revoke all on function public.get_portal_bookings() from public;
grant execute on function public.get_portal_bookings() to authenticated;
revoke all on function public.get_portal_customer_records() from public;
grant execute on function public.get_portal_customer_records() to authenticated;
