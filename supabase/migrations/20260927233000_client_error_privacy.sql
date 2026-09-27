-- Browser telemetry is operational data, not a permanent record. Keep a short
-- troubleshooting window and remove older reports automatically.
create function public.prune_client_errors()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.client_errors
  where created_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_client_errors() from public, anon, authenticated;
grant execute on function public.prune_client_errors() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'prune-client-errors';

select cron.schedule(
  'prune-client-errors',
  '19 3 * * *',
  $$select public.prune_client_errors()$$
);
