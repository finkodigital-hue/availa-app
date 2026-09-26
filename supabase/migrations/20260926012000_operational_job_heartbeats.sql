-- Durable liveness evidence for provider and recovery jobs. The monitoring
-- endpoint alerts when the reminder/recovery sweep has not completed recently;
-- a healthy website alone is not proof that scheduled work is running.
create table public.operational_job_heartbeats (
  job_name text primary key check (job_name ~ '^[a-z0-9-]{1,80}$'),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_success_at timestamptz,
  last_summary jsonb,
  updated_at timestamptz not null default now()
);

alter table public.operational_job_heartbeats enable row level security;
revoke all on public.operational_job_heartbeats from public, anon, authenticated;
grant all on public.operational_job_heartbeats to service_role;

insert into public.operational_job_heartbeats (job_name)
values ('send-reminders')
on conflict (job_name) do nothing;
