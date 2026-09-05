begin;

do $$
begin
  if has_function_privilege('anon', 'public.submit_customer_review(text,integer,text)', 'execute')
     or has_function_privilege('authenticated', 'public.submit_customer_review(text,integer,text)', 'execute')
     or not has_function_privilege('service_role', 'public.submit_customer_review(text,integer,text)', 'execute') then
    raise exception 'submit_customer_review permissions are unsafe';
  end if;
  if has_function_privilege('anon', 'public.set_customer_review_visibility(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_customer_review_visibility(uuid,boolean)', 'execute') then
    raise exception 'review visibility permissions are unsafe';
  end if;
end $$;

insert into public.booking_action_tokens (booking_id, action, token_hash, expires_at)
values
  ('61000000-0000-0000-0000-000000000001', 'review', 'local-review-completed', now() + interval '1 day'),
  ('61000000-0000-0000-0000-000000000003', 'review', 'local-review-future', now() + interval '1 day');

do $$
declare result jsonb;
begin
  result := public.submit_customer_review('local-review-completed', 5, 'A genuinely lovely appointment.');
  if not coalesce((result->>'ok')::boolean, false) then raise exception 'valid review failed: %', result; end if;

  result := public.submit_customer_review('local-review-completed', 4, 'Replay attempt');
  if result->>'reason' <> 'used' then raise exception 'review token was reusable: %', result; end if;

  result := public.submit_customer_review('local-review-future', 5, 'Too early');
  if result->>'reason' <> 'not_completed' then raise exception 'future booking accepted: %', result; end if;

  if (select count(*) from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'one-review-per-booking invariant failed';
  end if;
end $$;

select set_config('request.jwt.claim.sub', (select owner_id::text from public.businesses where id = '21000000-0000-0000-0000-000000000001'), true);
set local role authenticated;
select public.set_customer_review_visibility(
  (select id from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001'),
  false
);
reset role;

do $$
begin
  if (select status from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001') <> 'hidden' then
    raise exception 'owner could not hide review';
  end if;
end $$;

update public.customers
set name = 'Deleted customer', email = null
where id = (select customer_id from public.bookings where id = '61000000-0000-0000-0000-000000000001');

do $$
begin
  if exists (select 1 from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001') then
    raise exception 'customer erasure left review text behind';
  end if;
end $$;

rollback;
