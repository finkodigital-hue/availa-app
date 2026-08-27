-- Keep completed-booking stock usage accurate and idempotent. Recipe rows are
-- grouped per inventory item, the ledger records only what was actually on
-- hand, and reversing completion restores exactly that recorded quantity.
create or replace function public.apply_booking_stock_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    -- A non-completed booking should not have ledger rows. Clearing any stale
    -- rows makes a retried completion safe without deducting the same row twice.
    delete from public.booking_stock_deductions
     where booking_id = new.id;

    insert into public.booking_stock_deductions (
      business_id,
      booking_id,
      inventory_item_id,
      quantity
    )
    select
      new.business_id,
      new.id,
      recipe.inventory_item_id,
      least(recipe.quantity, greatest(0, item.current_stock))
    from (
      select inventory_item_id, sum(greatest(0, quantity)) as quantity
      from public.service_recipe_items
      where service_id = new.service_id
      group by inventory_item_id
    ) recipe
    join public.inventory_items item on item.id = recipe.inventory_item_id
    where recipe.quantity > 0;

    update public.inventory_items item
       set current_stock = greatest(0, item.current_stock - used.quantity)
      from (
        select inventory_item_id, sum(quantity) as quantity
        from public.booking_stock_deductions
        where booking_id = new.id
        group by inventory_item_id
      ) used
     where item.id = used.inventory_item_id;

  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    update public.inventory_items item
       set current_stock = item.current_stock + used.quantity
      from (
        select inventory_item_id, sum(quantity) as quantity
        from public.booking_stock_deductions
        where booking_id = old.id
        group by inventory_item_id
      ) used
     where item.id = used.inventory_item_id;

    delete from public.booking_stock_deductions
     where booking_id = old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_stock_deduction on public.bookings;
create trigger bookings_stock_deduction
after update of status on public.bookings
for each row
execute function public.apply_booking_stock_deduction();

revoke execute on function public.apply_booking_stock_deduction() from public, anon, authenticated;
