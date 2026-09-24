-- Keep anonymous appointment requests short-lived. Only a future explicitly
-- verified customer link can enter the automatic customer rights workflow;
-- matching self-reported name/email is not proof of authorship.
alter table public.appointment_waitlist_requests
  add column expires_at timestamptz not null default (now() + interval '90 days');
-- Reserved for a future verified portal flow. Anonymous submissions never set
-- this field: self-reported contact details are not proof of identity.
alter table public.appointment_waitlist_requests
  add column verified_customer_id uuid references public.customers(id) on delete set null;
create index appointment_waitlist_expiry on public.appointment_waitlist_requests(expires_at);
create index appointment_waitlist_verified_customer on public.appointment_waitlist_requests(verified_customer_id)
  where verified_customer_id is not null;
grant delete on public.appointment_waitlist_requests to authenticated;
create policy "owners delete appointment waitlist requests" on public.appointment_waitlist_requests
  for delete to authenticated using (public.is_business_owner(business_id));

create function public.prune_appointment_waitlist_requests()
returns integer language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
  delete from appointment_waitlist_requests
  where ctid in (
    select ctid from appointment_waitlist_requests
    where expires_at < now() order by expires_at limit 500
  );
  get diagnostics removed = row_count;
  return removed;
end;$$;
revoke all on function public.prune_appointment_waitlist_requests() from public,anon,authenticated;
grant execute on function public.prune_appointment_waitlist_requests() to service_role;
select cron.schedule('prune-appointment-waitlist', '15 * * * *',
  $$select public.prune_appointment_waitlist_requests()$$);

-- Called only after the application has authenticated the salon owner and
-- identified the data request's customer. Anonymous requests are not linked
-- by name/email; they need manual identity review rather than accidental
-- disclosure of a self-reported phone number in somebody else's export.
create function public.customer_appointment_waitlist_export(
  p_business_id uuid, p_customer_id uuid
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_rows jsonb;
begin
  if not exists(select 1 from customers where id=p_customer_id and business_id=p_business_id) then
    raise exception 'Customer not found';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'serviceId',service_id,'preferredStaffId',preferred_staff_id,
    'preferredAfter',preferred_after,'preferredBefore',preferred_before,
    'preferredTime',preferred_time,'status',status,'name',customer_name,
    'email',customer_email,'phone',customer_phone,'createdAt',created_at
  ) order by created_at desc),'[]'::jsonb) into v_rows
  from appointment_waitlist_requests where business_id=p_business_id
    and verified_customer_id=p_customer_id;
  return jsonb_build_object('requests',v_rows);
end;$$;
revoke all on function public.customer_appointment_waitlist_export(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_appointment_waitlist_export(uuid,uuid) to service_role;

-- The original erasure RPC is atomic. Wrap it so a failed erasure also rolls
-- back any waitlist deletion; do not mark the request complete prematurely.
alter function public.erase_customer(uuid,uuid,uuid,uuid) rename to erase_customer_without_waitlist;
revoke all on function public.erase_customer_without_waitlist(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.erase_customer(
  p_business_id uuid, p_customer_id uuid, p_request_id uuid, p_resolved_by uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_deleted integer := 0; v_result jsonb;
begin
  delete from appointment_waitlist_requests where business_id=p_business_id
    and verified_customer_id=p_customer_id;
  get diagnostics v_deleted = row_count;
  v_result := public.erase_customer_without_waitlist(
    p_business_id,p_customer_id,p_request_id,p_resolved_by);
  return v_result || jsonb_build_object('appointment_requests_deleted',v_deleted);
end;$$;
revoke all on function public.erase_customer(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_customer(uuid,uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
