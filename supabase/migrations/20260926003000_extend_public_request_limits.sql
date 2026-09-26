-- Give public confirmation and error-intake endpoints their own source quotas.
-- Counters contain only a daily rotating HMAC of the connecting IP, never the
-- raw address, email, booking id, user agent, or error text.
alter table public.public_request_counters
  drop constraint if exists public_request_counters_scope_check;

alter table public.public_request_counters
  add constraint public_request_counters_scope_check
  check (scope in (
    'booking', 'gift', 'waitlist', 'auth', 'confirmation', 'telemetry'
  ));

create or replace function public.consume_public_request(
  p_source_key text,
  p_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  minute_limit integer;
  day_limit integer;
  period_name text;
  starts timestamptz;
  duration interval;
  maximum integer;
  used integer;
begin
  if p_source_key is null or p_source_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid source key';
  end if;

  case p_scope
    when 'booking' then minute_limit := 20; day_limit := 200;
    when 'gift' then minute_limit := 10; day_limit := 100;
    when 'waitlist' then minute_limit := 3; day_limit := 20;
    when 'auth' then minute_limit := 30; day_limit := 600;
    when 'confirmation' then minute_limit := 30; day_limit := 500;
    when 'telemetry' then minute_limit := 60; day_limit := 2000;
    else raise exception 'Invalid public request scope';
  end case;

  perform pg_advisory_xact_lock(
    hashtext('public-request:' || p_scope || ':' || p_source_key)
  );
  delete from public_request_counters
  where ctid in (
    select ctid from public_request_counters
    where expires_at < now()
    limit 100
  );

  foreach period_name in array array['minute', 'day'] loop
    starts := date_trunc(period_name, now() at time zone 'UTC') at time zone 'UTC';
    duration := case
      when period_name = 'minute' then interval '1 minute'
      else interval '1 day'
    end;
    maximum := case
      when period_name = 'minute' then minute_limit
      else day_limit
    end;
    select requests into used
    from public_request_counters
    where source_key = p_source_key
      and scope = p_scope
      and period = period_name
      and bucket_start = starts;
    if coalesce(used, 0) >= maximum then
      return jsonb_build_object(
        'allowed', false,
        'retry_after', greatest(
          1,
          ceil(extract(epoch from starts + duration - now()))
        )::integer
      );
    end if;
  end loop;

  foreach period_name in array array['minute', 'day'] loop
    starts := date_trunc(period_name, now() at time zone 'UTC') at time zone 'UTC';
    insert into public_request_counters(
      source_key, scope, period, bucket_start, requests, expires_at
    ) values (
      p_source_key, p_scope, period_name, starts, 1, starts + interval '2 days'
    )
    on conflict (source_key, scope, period, bucket_start)
    do update set requests = public_request_counters.requests + 1;
  end loop;

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.consume_public_request(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_public_request(text, text)
  to service_role;

notify pgrst, 'reload schema';
