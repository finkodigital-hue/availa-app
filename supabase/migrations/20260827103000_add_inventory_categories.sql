-- Optional salon-defined grouping used by the visual stock shelf.
alter table public.inventory_items
  add column if not exists category text;

create index if not exists idx_inventory_items_business_category
  on public.inventory_items (business_id, category);

comment on column public.inventory_items.category is
  'Optional owner-defined category used to group stock items.';
