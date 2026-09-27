-- Run after `supabase db reset`:
-- psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/permissive_policy_consolidation.sql
--
-- Supabase's performance adviser flags more than one permissive policy that
-- applies to the same role, table and operation. PUBLIC policies apply to both
-- anon and authenticated, so expand them before counting.

do $$
declare
  v_overlaps jsonb;
begin
  with policy_roles as (
    select
      p.tablename,
      p.policyname,
      p.cmd,
      unnest(
        case
          when 'public'::name = any(p.roles)
            then array['anon'::name, 'authenticated'::name]
          else p.roles
        end
      ) as role_name
    from pg_policies p
    where p.schemaname = 'public'
      and p.permissive = 'PERMISSIVE'
      and p.tablename = any(array[
        'blocked_dates', 'bookings', 'business_hour_periods',
        'business_hours', 'business_media', 'businesses', 'customers',
        'holiday_closures', 'inventory_items', 'page_layouts', 'profiles',
        'rent_payments', 'salon_professionals', 'service_staff', 'services',
        'staff', 'staff_hours', 'staff_memberships'
      ])
  ), policy_actions as (
    select
      tablename,
      policyname,
      role_name,
      unnest(
        case cmd
          when 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
          else array[cmd]
        end
      ) as action
    from policy_roles
  ), duplicate_groups as (
    select
      tablename,
      role_name,
      action,
      array_agg(policyname order by policyname) as policies
    from policy_actions
    group by tablename, role_name, action
    having count(*) > 1
  )
  select jsonb_agg(to_jsonb(duplicate_groups))
  into v_overlaps
  from duplicate_groups;

  if v_overlaps is not null then
    raise exception 'overlapping permissive policies remain: %', v_overlaps;
  end if;
end $$;
