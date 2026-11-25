-- Customers and their history already use customers.manage. Match that scope
-- in the summary functions so permitted staff do not see false zero totals.
-- The scalar permission check is evaluated once per statement, not per booking.
create or replace function public.customer_visit_counts(_business_id uuid)
returns table(customer_id uuid, visits bigint)
language sql stable security definer set search_path = public as $$
  select b.customer_id, count(*) as visits
  from public.bookings b
  where b.business_id = _business_id
    and b.customer_id is not null
    and b.status <> 'cancelled'
    and b.starts_at < now()
    and (select public.has_business_permission(_business_id, 'customers.manage'))
  group by b.customer_id;
$$;

create or replace function public.customer_export_stats(_business_id uuid)
returns table(
  customer_id uuid,
  visits bigint,
  total_spent_cents bigint,
  first_visit timestamptz,
  last_visit timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.customer_id, count(*) as visits,
    coalesce(sum(b.price_cents), 0) as total_spent_cents,
    min(b.starts_at) as first_visit, max(b.starts_at) as last_visit
  from public.bookings b
  where b.business_id = _business_id
    and b.customer_id is not null
    and b.status <> 'cancelled'
    and b.starts_at < now()
    and (select public.has_business_permission(_business_id, 'customers.manage'))
  group by b.customer_id;
$$;

revoke all on function public.customer_visit_counts(uuid), public.customer_export_stats(uuid) from public, anon;
grant execute on function public.customer_visit_counts(uuid), public.customer_export_stats(uuid) to authenticated, service_role;
