-- Safety ceilings, independent of billing entitlements. Only operators can
-- change limits; public clients cannot spend or reset another tenant's budget.
create table public.business_usage_limits (
 business_id uuid not null references public.businesses(id) on delete cascade,
 feature text not null check(feature in ('ai','sms')),
 minute_limit integer not null check(minute_limit between 1 and 100000),
 daily_limit integer not null check(daily_limit between 1 and 100000),
 monthly_limit integer not null check(monthly_limit between 1 and 1000000),
 primary key(business_id,feature)
);
create table public.business_usage_counters (
 business_id uuid not null references public.businesses(id) on delete cascade,
 feature text not null check(feature in ('ai','sms')),
 period text not null check(period in ('minute','day','month')),
 period_start timestamptz not null,
 used integer not null default 0,
 primary key(business_id,feature,period,period_start)
);
alter table public.business_usage_limits enable row level security;
alter table public.business_usage_counters enable row level security;
revoke all on public.business_usage_limits,public.business_usage_counters from public,anon,authenticated;
grant all on public.business_usage_limits,public.business_usage_counters to service_role;

create function public.consume_business_usage(p_business_id uuid,p_feature text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare limits business_usage_limits%rowtype; part text; start_at timestamptz; end_at timestamptz; cap integer; count_used integer;
begin
 if p_feature not in ('ai','sms') then raise exception 'Invalid usage category';end if;
 if not exists(select 1 from businesses where id=p_business_id and deletion_requested_at is null) then raise exception 'Workspace unavailable';end if;
 perform pg_advisory_xact_lock(hashtext('usage:'||p_business_id::text||':'||p_feature));
 select * into limits from business_usage_limits where business_id=p_business_id and feature=p_feature;
 foreach part in array array['minute','day','month'] loop
  start_at:=date_trunc(part,now() at time zone 'UTC') at time zone 'UTC';
  end_at:=start_at+case part when 'minute' then interval '1 minute' when 'day' then interval '1 day' else interval '1 month' end;
  cap:=case part when 'minute' then coalesce(limits.minute_limit,case p_feature when 'ai' then 10 else 30 end)
   when 'day' then coalesce(limits.daily_limit,case p_feature when 'ai' then 100 else 250 end)
   else coalesce(limits.monthly_limit,case p_feature when 'ai' then 1000 else 2000 end) end;
  select used into count_used from business_usage_counters where business_id=p_business_id and feature=p_feature and period=part and period_start=start_at;
  if coalesce(count_used,0)>=cap then return jsonb_build_object('allowed',false,'period',part,'retry_after',greatest(1,ceil(extract(epoch from end_at-now()))::integer));end if;
 end loop;
 foreach part in array array['minute','day','month'] loop
  insert into business_usage_counters(business_id,feature,period,period_start,used)
   values(p_business_id,p_feature,part,date_trunc(part,now() at time zone 'UTC') at time zone 'UTC',1)
   on conflict(business_id,feature,period,period_start) do update set used=business_usage_counters.used+1;
 end loop;
 return jsonb_build_object('allowed',true);
end;$$;
revoke all on function public.consume_business_usage(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_business_usage(uuid,text) to service_role;
create function public.prune_business_usage_counters() returns void language sql security definer set search_path=public as $$
 delete from business_usage_counters where period_start<now()-interval '40 days';
$$;
revoke all on function public.prune_business_usage_counters() from public,anon,authenticated;
grant execute on function public.prune_business_usage_counters() to service_role;
notify pgrst,'reload schema';
