-- Unified, server-mediated support workflow. The previous feedback and
-- support_requests tables remain intact for audit/rollback, and are copied
-- into this queue once. Operators work this queue with the service role (for
-- example in Supabase Studio); account owners only reach it through the
-- authenticated application server.
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  business_id uuid references public.businesses(id) on delete set null,
  requester_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('support', 'feedback')),
  category text check (category is null or category in ('idea', 'issue', 'other')),
  subject text not null check (char_length(trim(subject)) between 3 and 200),
  message text not null check (char_length(trim(message)) between 5 and 4000),
  urgency text not null default 'normal' check (urgency in ('normal', 'urgent')),
  contact_email text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_type text not null check (actor_type in ('requester', 'operator', 'system')),
  event_type text not null check (event_type in ('submitted', 'acknowledgement', 'reply', 'status_changed', 'internal_note')),
  body text check (body is null or char_length(trim(body)) between 1 and 4000),
  from_status text,
  to_status text,
  visible_to_requester boolean not null default true,
  created_at timestamptz not null default now()
);

create index support_tickets_requester_created_idx on public.support_tickets (requester_id, created_at desc);
create index support_tickets_status_updated_idx on public.support_tickets (status, updated_at desc);
create index support_ticket_events_ticket_created_idx on public.support_ticket_events (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_events enable row level security;
revoke all on public.support_tickets from anon, authenticated;
revoke all on public.support_ticket_events from anon, authenticated;
grant all on public.support_tickets to service_role;
grant all on public.support_ticket_events to service_role;
grant usage, select on sequence public.support_tickets_ticket_number_seq to service_role;

create or replace function public.record_support_ticket_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if new.status = 'resolved' and new.resolved_at is null then new.resolved_at := now(); end if;
    if new.status <> 'resolved' then new.resolved_at := null; end if;
    insert into public.support_ticket_events
      (ticket_id, actor_type, event_type, from_status, to_status, body)
    values
      (new.id, 'operator', 'status_changed', old.status, new.status,
       'Status changed from ' || replace(old.status, '_', ' ') || ' to ' || replace(new.status, '_', ' ') || '.');
  end if;
  return new;
end;
$$;

create trigger record_support_ticket_change
before update on public.support_tickets
for each row execute function public.record_support_ticket_change();

-- Preserve the existing intake records in the new operator queue.
insert into public.support_tickets
  (id, business_id, requester_id, kind, category, subject, message, urgency, created_at, updated_at)
select id, business_id, user_id, 'feedback', category,
       case category when 'idea' then 'Product idea' when 'issue' then 'Product issue' else 'General feedback' end,
       message, 'normal', created_at, created_at
from public.feedback
on conflict (id) do nothing;

insert into public.support_tickets
  (id, business_id, requester_id, kind, subject, message, urgency, contact_email, status, created_at, updated_at, resolved_at)
select id, business_id, user_id, 'support', subject, message, urgency, contact_email,
       case status when 'resolved' then 'resolved' else 'open' end,
       created_at, created_at, case when status = 'resolved' then created_at else null end
from public.support_requests
on conflict (id) do nothing;

insert into public.support_ticket_events (ticket_id, actor_type, event_type, body, created_at)
select id, 'requester', 'submitted', message, created_at from public.support_tickets;

insert into public.support_ticket_events (ticket_id, actor_type, event_type, body, created_at)
select id, 'system', 'acknowledgement',
       'We received your request. The Bookzenvo support team will review it and reply here.',
       created_at + interval '1 millisecond'
from public.support_tickets;

comment on table public.support_tickets is 'Server-only support queue. Operators use service-role tooling; never grant browser table access.';
comment on column public.support_ticket_events.visible_to_requester is 'False for operator-only notes; the owner API filters these events server-side.';
