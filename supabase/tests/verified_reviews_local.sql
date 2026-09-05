begin;

select plan(1);

do $$
begin
  if to_regprocedure('public.submit_customer_review(text,integer,text)') is not null then
    raise exception 'unsafe legacy submit_customer_review function still exists';
  end if;
  if has_function_privilege('anon', 'public.submit_customer_review(text,integer,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.submit_customer_review(text,integer,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.submit_customer_review(text,integer,text,text)', 'execute') then
    raise exception 'submit_customer_review permissions are unsafe';
  end if;
  if to_regprocedure('public.set_customer_review_visibility(uuid,boolean)') is not null then
    raise exception 'unrestricted review visibility function still exists';
  end if;
  if has_function_privilege('anon', 'public.moderate_customer_review(uuid,text,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.moderate_customer_review(uuid,text,text,text)', 'execute') then
    raise exception 'review moderation permissions are unsafe';
  end if;
end $$;

delete from public.customer_reviews
where booking_id = '61000000-0000-0000-0000-000000000001';
delete from public.booking_action_tokens
where token_hash in ('local-review-completed', 'local-review-future');

insert into public.booking_action_tokens (booking_id, action, token_hash, expires_at)
values
  ('61000000-0000-0000-0000-000000000001', 'review', 'local-review-completed', now() + interval '1 day'),
  ('61000000-0000-0000-0000-000000000003', 'review', 'local-review-future', now() + interval '1 day');

do $$
declare result jsonb;
begin
  result := public.submit_customer_review('local-review-completed', 5, 'No valid publication agreement.', 'wrong-version');
  if result->>'reason' <> 'invalid_content' then raise exception 'review without valid consent was accepted: %', result; end if;

  result := public.submit_customer_review('local-review-completed', 5, 'A genuinely lovely appointment.', 'review-publication-v1');
  if not coalesce((result->>'ok')::boolean, false) then raise exception 'valid review failed: %', result; end if;

  result := public.submit_customer_review('local-review-completed', 4, 'Replay attempt', 'review-publication-v1');
  if result->>'reason' <> 'used' then raise exception 'review token was reusable: %', result; end if;

  result := public.submit_customer_review('local-review-future', 5, 'Too early', 'review-publication-v1');
  if result->>'reason' <> 'not_completed' then raise exception 'future booking accepted: %', result; end if;

  if (select count(*) from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'one-review-per-booking invariant failed';
  end if;
  if (select publication_consent_version from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001') <> 'review-publication-v1' then
    raise exception 'publication consent was not recorded';
  end if;
end $$;

select set_config('request.jwt.claim.sub', (select owner_id::text from public.businesses where id = '21000000-0000-0000-0000-000000000001'), true);
set local role authenticated;
select public.moderate_customer_review(
  (select id from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001'),
  'remove',
  'personal_information',
  'The review includes a private telephone number.'
);
reset role;

do $$
begin
  if (select status from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001') <> 'hidden' then
    raise exception 'owner could not remove policy-breaking review';
  end if;
  if not exists (
    select 1 from public.review_moderation_events
    where review_id = (select id from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001')
      and action = 'remove'
      and reason = 'personal_information'
  ) then
    raise exception 'review moderation audit event was not recorded';
  end if;
end $$;

select set_config('request.jwt.claim.sub', (select owner_id::text from public.businesses where id = '21000000-0000-0000-0000-000000000001'), true);
set local role authenticated;
select public.moderate_customer_review(
  (select id from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001'),
  'restore',
  null,
  null
);
reset role;

do $$
begin
  if (select status from public.customer_reviews where booking_id = '61000000-0000-0000-0000-000000000001') <> 'published' then
    raise exception 'owner could not restore review';
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

select pass('verified review consent, moderation, replay protection and erasure safeguards passed');
select * from finish();

rollback;
