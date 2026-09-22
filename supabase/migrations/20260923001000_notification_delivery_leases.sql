-- Provider request snapshots must never be exposed with owner delivery metadata.
alter table public.notification_deliveries
 add column lease_token uuid,
 add column lease_expires_at timestamptz,
 add column first_attempt_at timestamptz,
 add column manual_review boolean not null default false;

create table public.notification_request_snapshots (
 delivery_id uuid primary key references public.notification_deliveries(id) on delete cascade,
 payload jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.notification_request_snapshots enable row level security;
revoke all on public.notification_request_snapshots from public,anon,authenticated;
grant all on public.notification_request_snapshots to service_role;

create function public.claim_notification_delivery(p_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d notification_deliveries%rowtype; saved_payload jsonb; token uuid;
begin
 select * into d from notification_deliveries where id=p_id for update;
 if not found then raise exception 'Delivery not found';end if;
 if d.status in ('sent','delivered','suppressed') or d.provider_message_id is not null then
   return jsonb_build_object('state','complete','provider_message_id',d.provider_message_id);
 end if;
 if d.manual_review then return jsonb_build_object('state','review');end if;
 if d.lease_expires_at>now() then return jsonb_build_object('state','deferred');end if;
 if (d.channel='sms' and d.status='sending')
    or (d.first_attempt_at is not null and d.first_attempt_at<now()-interval '23 hours')
    or d.attempt_count>=5 then
   update notification_deliveries set manual_review=true,status='failed',next_attempt_at=null,
    last_error='Delivery outcome or retry limit requires manual review',updated_at=now() where id=p_id;
   return jsonb_build_object('state','review');
 end if;
 if d.next_attempt_at>now() then return jsonb_build_object('state','deferred');end if;
 insert into notification_request_snapshots(delivery_id,payload) values(p_id,p_payload) on conflict do nothing;
 select payload into saved_payload from notification_request_snapshots where delivery_id=p_id;
 token:=gen_random_uuid();
 update notification_deliveries set status='sending',lease_token=token,lease_expires_at=now()+interval '2 minutes',
   first_attempt_at=coalesce(first_attempt_at,now()),attempt_count=attempt_count+1,updated_at=now() where id=p_id;
 return jsonb_build_object('state','claimed','lease_token',token,'payload',saved_payload);
end;$$;

create function public.finish_notification_delivery(p_id uuid,p_lease uuid,p_provider_id text,p_retryable boolean,p_error text)
returns boolean language plpgsql security definer set search_path=public as $$
declare d notification_deliveries%rowtype;
begin
 select * into d from notification_deliveries where id=p_id for update;
 if not found or d.lease_token is distinct from p_lease then return false;end if;
 -- A signed delivery callback may already have completed the same request.
 if d.provider_message_id is not null then return true;end if;
 if p_provider_id is not null then
  update notification_deliveries set status='sent',provider=case when channel='email' then 'resend' else 'twilio' end,
   provider_message_id=p_provider_id,sent_at=now(),last_error=null,failed_at=null,next_attempt_at=null,
   lease_expires_at=null,lease_token=null,manual_review=false,updated_at=now() where id=p_id;
  delete from notification_request_snapshots where delivery_id=p_id;
 else
  update notification_deliveries set status='failed',failed_at=now(),last_error=left(p_error,500),
   manual_review=not p_retryable or attempt_count>=5,
   next_attempt_at=case when p_retryable and attempt_count<5 then now()+make_interval(mins=>power(2,attempt_count)::integer) else null end,
   lease_expires_at=null,lease_token=null,updated_at=now() where id=p_id;
 end if;
 return true;
end;$$;

-- Legacy ambiguous submissions have no immutable request snapshot. Do not guess
-- their provider outcome or blindly submit an SMS twice during the transition.
update public.notification_deliveries set manual_review=true,status='failed',next_attempt_at=null,
 last_error='Legacy unfinished delivery requires provider review',updated_at=now()
where provider_message_id is null and (status='sending' or (status='failed' and attempt_count>0));

revoke all on function public.claim_notification_delivery(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_notification_delivery(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_notification_delivery(uuid,jsonb) to service_role;
grant execute on function public.finish_notification_delivery(uuid,uuid,text,boolean,text) to service_role;

create function public.record_notification_provider_status(p_provider text,p_provider_id text,p_status text,p_delivery_id uuid default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare d notification_deliveries%rowtype;
begin
 if p_provider not in ('resend','twilio') or p_status not in ('sent','delivered','failed') then raise exception 'Invalid provider status';end if;
 select * into d from notification_deliveries
  where (provider=p_provider and provider_message_id=p_provider_id)
   or (id=p_delivery_id and p_provider='twilio' and channel='sms' and first_attempt_at is not null)
  order by provider_message_id nulls last limit 1 for update;
 if not found then return false;end if;
 if d.provider_message_id is not null and d.provider_message_id<>p_provider_id then return false;end if;
 -- Never let a delayed intermediate/failure event downgrade confirmed delivery.
 if d.status='delivered' or (d.status='failed' and d.provider_message_id is not null and p_status='sent') then return true;end if;
 update notification_deliveries set provider=p_provider,provider_message_id=p_provider_id,status=p_status,
  delivered_at=case when p_status='delivered' then now() else delivered_at end,
  failed_at=case when p_status='failed' then now() else null end,
  manual_review=p_status='failed',next_attempt_at=null,lease_expires_at=null,
  last_error=case when p_status='failed' then 'Provider reported unsuccessful delivery; review required' else null end,
  updated_at=now() where id=d.id;
 delete from notification_request_snapshots where delivery_id=d.id;
 return true;
end;$$;
revoke all on function public.record_notification_provider_status(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_notification_provider_status(text,text,text,uuid) to service_role;

create function public.sweep_notification_delivery_leases()
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
 with expired as (
  select id from notification_deliveries where not manual_review and provider_message_id is null
   and status in ('sending','failed') and (first_attempt_at<now()-interval '23 hours'
    or (channel='sms' and status='sending' and lease_expires_at<now()) or attempt_count>=5)
   limit 200 for update skip locked
 ) update notification_deliveries set manual_review=true,status='failed',next_attempt_at=null,
   last_error='Expired or uncertain delivery requires provider review',updated_at=now()
   where id in(select id from expired);
 get diagnostics changed=row_count;
 delete from notification_request_snapshots where created_at<now()-interval '24 hours';
 return changed;
end;$$;
revoke all on function public.sweep_notification_delivery_leases() from public,anon,authenticated;
grant execute on function public.sweep_notification_delivery_leases() to service_role;
notify pgrst,'reload schema';
