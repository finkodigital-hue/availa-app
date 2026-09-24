-- Short-lived pseudonymous source counters; no raw IP, email or user agent.
create table public.public_request_counters(
 source_key text not null check(source_key~'^[a-f0-9]{64}$'),
 scope text not null check(scope in('booking','gift','waitlist','auth')),
 period text not null check(period in('minute','day')),
 bucket_start timestamptz not null,requests integer not null check(requests>=0),
 expires_at timestamptz not null,
 primary key(source_key,scope,period,bucket_start)
);
create index public_request_counters_expiry on public.public_request_counters(expires_at);
alter table public.public_request_counters enable row level security;
revoke all on public.public_request_counters from public,anon,authenticated;
grant all on public.public_request_counters to service_role;

create function public.consume_public_request(p_source_key text,p_scope text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare minute_limit integer;day_limit integer;period_name text;starts timestamptz;duration interval;maximum integer;used integer;
begin
 if p_source_key is null or p_source_key!~'^[a-f0-9]{64}$' then raise exception 'Invalid source key';end if;
 case p_scope
  when 'booking' then minute_limit:=20;day_limit:=200;
  when 'gift' then minute_limit:=10;day_limit:=100;
  when 'waitlist' then minute_limit:=3;day_limit:=20;
  when 'auth' then minute_limit:=30;day_limit:=600;
  else raise exception 'Invalid public request scope';
 end case;
 perform pg_advisory_xact_lock(hashtext('public-request:'||p_scope||':'||p_source_key));
 -- Bounded opportunistic expiry, also callable by the protected scheduler.
 delete from public_request_counters where ctid in(select ctid from public_request_counters where expires_at<now() limit 100);
 foreach period_name in array array['minute','day'] loop
  starts:=date_trunc(period_name,now() at time zone 'UTC') at time zone 'UTC';
  duration:=case when period_name='minute' then interval '1 minute' else interval '1 day' end;
  maximum:=case when period_name='minute' then minute_limit else day_limit end;
  select requests into used from public_request_counters where source_key=p_source_key and scope=p_scope and period=period_name and bucket_start=starts;
  if coalesce(used,0)>=maximum then
   return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from starts+duration-now())))::integer);
  end if;
 end loop;
 foreach period_name in array array['minute','day'] loop
  starts:=date_trunc(period_name,now() at time zone 'UTC') at time zone 'UTC';
  insert into public_request_counters(source_key,scope,period,bucket_start,requests,expires_at)
   values(p_source_key,p_scope,period_name,starts,1,starts+interval '2 days')
   on conflict(source_key,scope,period,bucket_start) do update set requests=public_request_counters.requests+1;
 end loop;
 return jsonb_build_object('allowed',true);
end;$$;
revoke all on function public.consume_public_request(text,text) from public,anon,authenticated;
grant execute on function public.consume_public_request(text,text) to service_role;

create function public.cleanup_public_request_counters() returns integer
language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
 delete from public_request_counters where ctid in(select ctid from public_request_counters where expires_at<now() limit 10000);
 get diagnostics removed=row_count;return removed;
end;$$;
revoke all on function public.cleanup_public_request_counters() from public,anon,authenticated;
grant execute on function public.cleanup_public_request_counters() to service_role;
notify pgrst,'reload schema';
