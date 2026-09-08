-- Provider-neutral outbound calendar sync. Token bytes are held only in Vault;
-- browser-readable rows contain display/status metadata and opaque secret ids.
create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')), account_email text not null,
  calendar_id text not null, calendar_summary text, access_token_secret_id uuid not null,
  refresh_token_secret_id uuid not null, access_token_expires_at timestamptz not null,
  status text not null default 'connected' check (status in ('connected','needs_reconnect')),
  conflict_behavior text not null default 'bookzenvo_wins' check (conflict_behavior in ('bookzenvo_wins','report_only')),
  last_synced_at timestamptz, last_sync_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, provider)
);
alter table public.calendar_connections enable row level security;
create policy "owners read calendar connections" on public.calendar_connections for select to authenticated using (public.is_business_owner(business_id));

create table if not exists public.calendar_event_mappings (
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider_event_id text not null, updated_at timestamptz not null default now(), primary key(connection_id, booking_id)
);
alter table public.calendar_event_mappings enable row level security;

create or replace function public.upsert_calendar_connection(p_business_id uuid,p_provider text,p_account_email text,p_calendar_id text,p_calendar_summary text,p_access_token text,p_refresh_token text,p_access_token_expires_at timestamptz) returns void language plpgsql security definer set search_path=public,vault as $$
declare c record; aid uuid; rid uuid;
begin
 if p_provider not in ('google','microsoft') then raise exception 'Unsupported provider'; end if;
 select * into c from public.calendar_connections where business_id=p_business_id and provider=p_provider;
 if c is null then
  aid:=vault.create_secret(p_access_token,'calendar_access_'||p_provider||'_'||p_business_id); rid:=vault.create_secret(p_refresh_token,'calendar_refresh_'||p_provider||'_'||p_business_id);
  insert into public.calendar_connections(business_id,provider,account_email,calendar_id,calendar_summary,access_token_secret_id,refresh_token_secret_id,access_token_expires_at) values(p_business_id,p_provider,p_account_email,p_calendar_id,p_calendar_summary,aid,rid,p_access_token_expires_at);
 else
  perform vault.update_secret(c.access_token_secret_id,p_access_token); perform vault.update_secret(c.refresh_token_secret_id,p_refresh_token);
  update public.calendar_connections set account_email=p_account_email,calendar_id=p_calendar_id,calendar_summary=p_calendar_summary,access_token_expires_at=p_access_token_expires_at,status='connected',last_sync_error=null,updated_at=now() where id=c.id;
 end if;
end $$;
revoke all on function public.upsert_calendar_connection(uuid,text,text,text,text,text,text,timestamptz) from public,anon,authenticated; grant execute on function public.upsert_calendar_connection(uuid,text,text,text,text,text,text,timestamptz) to service_role;

create or replace function public.get_calendar_credentials(p_business_id uuid) returns table(connection_id uuid,provider text,access_token text,refresh_token text,access_token_expires_at timestamptz) language sql security definer set search_path=public,vault as $$ select c.id,c.provider,a.decrypted_secret,r.decrypted_secret,c.access_token_expires_at from public.calendar_connections c join vault.decrypted_secrets a on a.id=c.access_token_secret_id join vault.decrypted_secrets r on r.id=c.refresh_token_secret_id where c.business_id=p_business_id and c.status='connected' $$;
revoke all on function public.get_calendar_credentials(uuid) from public,anon,authenticated; grant execute on function public.get_calendar_credentials(uuid) to service_role;

create or replace function public.update_calendar_access_token(p_connection_id uuid,p_access_token text,p_access_token_expires_at timestamptz,p_new_refresh_token text default null) returns void language plpgsql security definer set search_path=public,vault as $$ declare c record; begin select * into c from public.calendar_connections where id=p_connection_id; if c is null then return; end if; perform vault.update_secret(c.access_token_secret_id,p_access_token); if p_new_refresh_token is not null then perform vault.update_secret(c.refresh_token_secret_id,p_new_refresh_token); end if; update public.calendar_connections set access_token_expires_at=p_access_token_expires_at,updated_at=now() where id=p_connection_id; end $$;
revoke all on function public.update_calendar_access_token(uuid,text,timestamptz,text) from public,anon,authenticated; grant execute on function public.update_calendar_access_token(uuid,text,timestamptz,text) to service_role;

create or replace function public.mark_calendar_sync_result(p_connection_id uuid,p_success boolean,p_error text default null,p_needs_reconnect boolean default false) returns void language sql security definer set search_path=public as $$ update public.calendar_connections set last_synced_at=case when p_success then now() else last_synced_at end,last_sync_error=p_error,status=case when p_needs_reconnect then 'needs_reconnect' else status end,updated_at=now() where id=p_connection_id $$;
revoke all on function public.mark_calendar_sync_result(uuid,boolean,text,boolean) from public,anon,authenticated; grant execute on function public.mark_calendar_sync_result(uuid,boolean,text,boolean) to service_role;

create or replace function public.disconnect_calendar(p_connection_id uuid) returns void language plpgsql security definer set search_path=public,vault as $$ declare c record; begin select * into c from public.calendar_connections where id=p_connection_id; if c is null then return; end if; if not public.is_business_owner(c.business_id) then raise exception 'Not authorized'; end if; delete from public.calendar_connections where id=c.id; perform vault.delete_secret(c.access_token_secret_id); perform vault.delete_secret(c.refresh_token_secret_id); end $$;
revoke all on function public.disconnect_calendar(uuid) from public; grant execute on function public.disconnect_calendar(uuid) to authenticated;

-- Durable outbox: booking writes never depend on provider uptime and failed delivery can be retried.
create table if not exists public.calendar_sync_outbox(booking_id uuid primary key references public.bookings(id) on delete cascade,business_id uuid not null references public.businesses(id) on delete cascade,attempts int not null default 0,next_attempt_at timestamptz not null default now(),last_error text,updated_at timestamptz not null default now());
alter table public.calendar_sync_outbox enable row level security;
create or replace function public.enqueue_calendar_sync() returns trigger language plpgsql security definer set search_path=public as $$ begin if exists(select 1 from public.calendar_connections where business_id=new.business_id and status='connected') then insert into public.calendar_sync_outbox(booking_id,business_id) values(new.id,new.business_id) on conflict(booking_id) do update set next_attempt_at=now(),last_error=null,updated_at=now(); end if; return new; end $$;
drop trigger if exists sync_booking_to_google_calendar on public.bookings;
drop trigger if exists enqueue_calendar_sync on public.bookings;
create trigger enqueue_calendar_sync after insert or update of starts_at,ends_at,staff_id,status,customer_name,service_id,custom_title on public.bookings for each row execute function public.enqueue_calendar_sync();

-- Delivery remains asynchronous, but the durable row is retained until the app acknowledges it.
create or replace function public.dispatch_calendar_sync() returns void language plpgsql security definer set search_path=public,extensions,vault as $$ declare q record; secret text; begin select decrypted_secret into secret from vault.decrypted_secrets where name='calendar_sync_secret'; if secret is null then return; end if; for q in select * from public.calendar_sync_outbox where next_attempt_at<=now() order by updated_at limit 100 loop perform net.http_post(url:='https://bookzenvo.com/api/internal/calendar-sync',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:=jsonb_build_object('booking_id',q.booking_id)); update public.calendar_sync_outbox set attempts=attempts+1,next_attempt_at=now()+least(interval '1 hour',interval '1 minute'*power(2,least(attempts,6))),updated_at=now() where booking_id=q.booking_id; end loop; end $$;
revoke all on function public.dispatch_calendar_sync() from public,anon,authenticated; grant execute on function public.dispatch_calendar_sync() to service_role;

create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'dispatch-calendar-sync';
select cron.schedule('dispatch-calendar-sync', '* * * * *', $$select public.dispatch_calendar_sync()$$);
