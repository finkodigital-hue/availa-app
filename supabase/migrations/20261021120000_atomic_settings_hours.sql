-- Both hour representations change together, or neither changes.
create or replace function public.save_business_opening_hours(p_business_id uuid, p_periods jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not coalesce(public.is_business_owner(p_business_id), false) then
    raise exception 'Only the business owner can change these hours.';
  end if;
  -- Serialise concurrent saves for the same business.
  perform id from public.businesses where id = p_business_id for update;
  if p_periods is null or jsonb_typeof(p_periods) <> 'array' then
    raise exception 'Opening hours must be an array.';
  end if;
  if jsonb_array_length(p_periods) > 100 then
    raise exception 'Too many opening periods.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_periods) as p(weekday integer, open_time text, close_time text)
    where weekday is null or weekday not between 0 and 6
      or open_time is null or close_time is null
      or open_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or close_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or open_time >= close_time
  ) then raise exception 'Enter valid weekdays and opening times before closing times.'; end if;
  if exists (
    select 1 from (
      select open_time, max(close_time) over (
        partition by weekday order by open_time, close_time rows between unbounded preceding and 1 preceding
      ) as previous_close
      from jsonb_to_recordset(p_periods) as p(weekday integer, open_time text, close_time text)
    ) periods where open_time < previous_close
  ) then raise exception 'Opening periods must not overlap.'; end if;

  delete from public.business_hour_periods where business_id = p_business_id;
  insert into public.business_hour_periods (business_id, weekday, open_time, close_time)
  select p_business_id, weekday, open_time::time, close_time::time
  from jsonb_to_recordset(p_periods) as p(weekday smallint, open_time text, close_time text);

  insert into public.business_hours (business_id, weekday, open_time, close_time, closed)
  select p_business_id, d.weekday, first_period.open_time::time, first_period.close_time::time, first_period.open_time is null
  from generate_series(0, 6) as d(weekday)
  left join lateral (
    select p.open_time, p.close_time
    from jsonb_to_recordset(p_periods) as p(weekday integer, open_time text, close_time text)
    where p.weekday = d.weekday order by p.open_time limit 1
  ) first_period on true
  on conflict (business_id, weekday) do update
  set open_time = excluded.open_time, close_time = excluded.close_time, closed = excluded.closed;
end;
$$;
revoke all on function public.save_business_opening_hours(uuid, jsonb) from public, anon;
grant execute on function public.save_business_opening_hours(uuid, jsonb) to authenticated;
