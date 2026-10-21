-- Approved 21 October: reviews on both plans; gift cards, staff accounts,
-- provider calendars and custom branding require Studio. Existing data stays.

create or replace function public.enforce_studio_gift_creation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name = 'gift_card_orders' then
    perform public.require_studio_business(new.business_id);
  elsif new.source = 'complimentary' then
    perform public.require_studio_business(new.business_id);
  end if;
  -- A paid order already in flight must still fulfil after a downgrade.
  return new;
end $$;
revoke all on function public.enforce_studio_gift_creation() from public, anon, authenticated;
create trigger gift_order_studio_insert before insert on public.gift_card_orders
for each row execute function public.enforce_studio_gift_creation();
create trigger gift_issue_studio_insert before insert on public.gift_cards
for each row execute function public.enforce_studio_gift_creation();

create or replace function public.enforce_studio_gift_redemption()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.type = 'redemption' then
    perform public.require_studio_business(new.business_id);
  end if;
  return new;
end $$;
revoke all on function public.enforce_studio_gift_redemption() from public, anon, authenticated;
create trigger gift_redemption_studio_insert before insert on public.gift_card_transactions
for each row execute function public.enforce_studio_gift_redemption();

create or replace function public.enforce_studio_branding()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.plan <> 'studio' and (
    new.custom_domain is distinct from old.custom_domain or
    new.favicon_url is distinct from old.favicon_url or
    new.browser_title is distinct from old.browser_title or
    new.email_logo_url is distinct from old.email_logo_url or
    new.email_footer is distinct from old.email_footer or
    (new.hide_powered_by and new.hide_powered_by is distinct from old.hide_powered_by)
  ) then
    raise exception 'This feature is on the Studio plan.';
  end if;
  return new;
end $$;
revoke all on function public.enforce_studio_branding() from public, anon, authenticated;
create trigger business_branding_studio_update before update on public.businesses
for each row execute function public.enforce_studio_branding();

create or replace function public.enforce_studio_staff_access()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Revoking an invitation or disabling a membership remains possible on Free.
  if tg_table_name = 'staff_memberships' then
    if new.active then perform public.require_studio_business(new.business_id); end if;
  elsif new.revoked_at is null then
    perform public.require_studio_business(new.business_id);
  end if;
  return new;
end $$;
revoke all on function public.enforce_studio_staff_access() from public, anon, authenticated;
create trigger membership_studio_write before insert or update on public.staff_memberships
for each row execute function public.enforce_studio_staff_access();
create trigger staff_invitation_studio_write before insert or update on public.staff_account_invitations
for each row execute function public.enforce_studio_staff_access();

create or replace function public.has_business_permission(_business_id uuid, _permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from businesses b where b.id=_business_id and b.owner_id=auth.uid())
  or exists(
    select 1 from staff_memberships m join businesses b on b.id=m.business_id
    where m.business_id=_business_id and m.user_id=auth.uid() and m.active
      and b.plan='studio'
      and case m.access_role
        when 'manager' then _permission = any(array['workspace.read','calendar.manage','customers.manage','services.manage','staff.manage','inventory.manage','reports.read'])
        when 'front_desk' then _permission = any(array['workspace.read','calendar.manage','customers.manage'])
        when 'practitioner' then _permission = any(array['workspace.read','calendar.read'])
        else false end
  );
$$;
revoke all on function public.has_business_permission(uuid,text) from public, anon;
grant execute on function public.has_business_permission(uuid,text) to authenticated;

create or replace function public.enforce_studio_calendar_connection()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.require_studio_business(new.business_id);
  return new;
end $$;
revoke all on function public.enforce_studio_calendar_connection() from public, anon, authenticated;
create trigger calendar_connection_studio_insert before insert on public.calendar_connections
for each row execute function public.enforce_studio_calendar_connection();

-- Restrictive policies combine with existing ownership/permission policies.
-- They cannot grant access to another business's stock.
create policy "Studio inventory access" on public.inventory_items as restrictive
for select to authenticated using (
  exists(select 1 from public.businesses b where b.id=business_id and b.plan='studio')
);
create policy "Studio recipe access" on public.service_recipe_items as restrictive
for select to authenticated using (
  exists(select 1 from public.businesses b where b.id=business_id and b.plan='studio')
);

-- Saved provider connections cannot keep syncing after a downgrade.
create or replace function public.get_calendar_credentials(p_business_id uuid)
returns table(connection_id uuid,provider text,access_token text,refresh_token text,access_token_expires_at timestamptz)
language sql security definer set search_path=public,vault as $$
  select c.id,c.provider,a.decrypted_secret,r.decrypted_secret,c.access_token_expires_at
  from public.calendar_connections c
  join public.businesses b on b.id=c.business_id and b.plan='studio'
  join vault.decrypted_secrets a on a.id=c.access_token_secret_id
  join vault.decrypted_secrets r on r.id=c.refresh_token_secret_id
  where c.business_id=p_business_id and c.status='connected'
$$;
revoke all on function public.get_calendar_credentials(uuid) from public,anon,authenticated;
grant execute on function public.get_calendar_credentials(uuid) to service_role;

create or replace function public.enqueue_calendar_sync()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.calendar_connections c
    join public.businesses b on b.id=c.business_id and b.plan='studio'
    where c.business_id=new.business_id and c.status='connected') then
    insert into public.calendar_sync_outbox(booking_id,business_id) values(new.id,new.business_id)
    on conflict(booking_id) do update set next_attempt_at=now(),last_error=null,updated_at=now();
  end if;
  return new;
end $$;
revoke all on function public.enqueue_calendar_sync() from public,anon,authenticated;

-- Free bookings still complete when saved Studio recipes exist. Reversals of
-- older Studio deductions can restore precisely the original ledger quantity.
create or replace function public.apply_booking_stock_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  usage record;
  available numeric;
  deducted numeric;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not exists(select 1 from public.businesses where id=new.business_id and plan='studio') then
      return new;
    end if;
    delete from public.booking_stock_deductions where booking_id = new.id;

    for usage in
      select recipe.inventory_item_id,
             sum(greatest(0, recipe.quantity)) as requested
        from public.service_recipe_items recipe
       where recipe.service_id = new.service_id
         and recipe.business_id = new.business_id
       group by recipe.inventory_item_id
      having sum(greatest(0, recipe.quantity)) > 0
       order by recipe.inventory_item_id
    loop
      select greatest(0, item.current_stock)
        into available
        from public.inventory_items item
       where item.id = usage.inventory_item_id
         and item.business_id = new.business_id
       for update;
      if found then
        deducted := least(usage.requested, available);
        if deducted > 0 then
          insert into public.booking_stock_deductions (
            business_id, booking_id, inventory_item_id, quantity
          ) values (
            new.business_id, new.id, usage.inventory_item_id, deducted
          );
          update public.inventory_items
             set current_stock = current_stock - deducted
           where id = usage.inventory_item_id
             and business_id = new.business_id;
        end if;
      end if;
    end loop;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    -- Lock deduction rows before their inventory rows, matching the manual
    -- adjustment function below, and restore precisely the recorded amount.
    perform 1
      from public.booking_stock_deductions
     where booking_id = old.id
     order by inventory_item_id
     for update;
    for usage in
      select inventory_item_id, sum(quantity) as deducted
        from public.booking_stock_deductions
       where booking_id = old.id
       group by inventory_item_id
       order by inventory_item_id
    loop
      perform 1
        from public.inventory_items
       where id = usage.inventory_item_id
         and business_id = old.business_id
       for update;
      update public.inventory_items
         set current_stock = current_stock + usage.deducted
       where id = usage.inventory_item_id
         and business_id = old.business_id;
    end loop;
    delete from public.booking_stock_deductions where booking_id = old.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.apply_booking_stock_deduction()
  from public, anon, authenticated;


create or replace function public.enforce_studio_inventory_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Only nested booking triggers may restore stock on a Free workspace.
  -- Direct browser writes and manual stock-adjustment RPCs run at depth one.
  if tg_table_name='inventory_items' and tg_op='UPDATE' and pg_trigger_depth()>1 then
    if (to_jsonb(new)-'current_stock'-'updated_at')=(to_jsonb(old)-'current_stock'-'updated_at')
      and new.current_stock >= old.current_stock then
      return new;
    end if;
  end if;
  if tg_op='DELETE' then
    perform public.require_studio_business(old.business_id);
    return old;
  end if;
  perform public.require_studio_business(new.business_id);
  return new;
end $$;
revoke all on function public.enforce_studio_inventory_write() from public,anon,authenticated;
