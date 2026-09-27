-- Record only stock that was actually removed. Lock inventory rows in a stable
-- order so simultaneous appointment completions cannot both claim the same
-- on-hand units and later manufacture stock when one completion is reversed.
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

-- A correction can consume only stock that is currently on hand. Otherwise a
-- clamped stock value paired with a larger ledger value would inflate stock if
-- the completion were later reversed.
create or replace function public.adjust_booking_stock_deduction(
  p_deduction_id uuid,
  p_new_quantity numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  old_quantity numeric;
  item_id uuid;
  workspace_id uuid;
  available numeric;
  delta numeric;
begin
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'Quantity must be zero or greater';
  end if;

  select quantity, inventory_item_id, business_id
    into old_quantity, item_id, workspace_id
    from public.booking_stock_deductions
   where id = p_deduction_id
   for update;
  if not found then raise exception 'Deduction record not found'; end if;

  select greatest(0, current_stock)
    into available
    from public.inventory_items
   where id = item_id and business_id = workspace_id
   for update;
  if not found then raise exception 'Inventory item not found'; end if;

  delta := p_new_quantity - old_quantity;
  if delta > available then
    raise exception 'Not enough stock is available for that adjustment';
  end if;

  update public.inventory_items
     set current_stock = current_stock - delta
   where id = item_id and business_id = workspace_id;
  update public.booking_stock_deductions
     set quantity = p_new_quantity
   where id = p_deduction_id;
end;
$$;

revoke execute on function public.adjust_booking_stock_deduction(uuid, numeric)
  from public, anon;
grant execute on function public.adjust_booking_stock_deduction(uuid, numeric)
  to authenticated;

notify pgrst, 'reload schema';
