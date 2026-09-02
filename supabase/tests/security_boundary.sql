begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_trigger(
  'public',
  'businesses',
  'protect_business_system_fields',
  'businesses protects server-managed plan, billing, and premium fields'
);
select has_trigger(
  'public',
  'bookings',
  'protect_booking_payment_provider_fields',
  'bookings protects Stripe and refund fields'
);
select has_trigger(
  'public',
  'customers',
  'protect_customer_payment_provider_fields',
  'customers protects Stripe customer identifiers'
);

select ok(
  not has_table_privilege('authenticated', 'public.payments', 'INSERT'),
  'authenticated users cannot insert verified payment rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.payments', 'UPDATE'),
  'authenticated users cannot update verified payment rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.payments', 'DELETE'),
  'authenticated users cannot delete verified payment rows'
);
select ok(
  has_table_privilege('authenticated', 'public.payments', 'SELECT'),
  'authenticated owners retain RLS-scoped payment read access'
);
select ok(
  not has_table_privilege('anon', 'public.payments', 'SELECT'),
  'anonymous users cannot read verified payment rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.payments', 'TRUNCATE'),
  'authenticated users cannot truncate the payment ledger'
);
select ok(
  not has_table_privilege('anon', 'public.payments', 'TRUNCATE'),
  'anonymous users cannot truncate the payment ledger'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  0,
  'every public table has Row Level Security enabled'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.protect_business_system_fields()',
    'EXECUTE'
  ),
  'authenticated users cannot invoke the business guard directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.protect_booking_payment_provider_fields()',
    'EXECUTE'
  ),
  'anonymous users cannot invoke the booking guard directly'
);

select * from finish();
rollback;
