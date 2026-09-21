create table public.studio_checkout_attempts (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 attempt_id uuid not null default gen_random_uuid(),
 customer_id text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '1 hour'
);
alter table public.studio_checkout_attempts enable row level security;
revoke all on public.studio_checkout_attempts from public,anon,authenticated;
grant all on public.studio_checkout_attempts to service_role;
create function public.claim_studio_checkout(p_business_id uuid,p_customer_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result studio_checkout_attempts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('studio:'||p_business_id::text));
  if not exists(select 1 from businesses where id=p_business_id and deletion_requested_at is null
    and stripe_billing_customer_id=p_customer_id and coalesce(plan,'free')='free') then
    raise exception 'This workspace cannot start a Studio checkout';
  end if;
  insert into studio_checkout_attempts(business_id,customer_id) values(p_business_id,p_customer_id)
  on conflict(business_id) do update set attempt_id=gen_random_uuid(),customer_id=excluded.customer_id,created_at=now(),expires_at=now()+interval '1 hour'
  where studio_checkout_attempts.expires_at<=now();
  select * into result from studio_checkout_attempts where business_id=p_business_id;
  if result.customer_id<>p_customer_id then raise exception 'Checkout customer mismatch';end if;
  return to_jsonb(result);
end;
$$;
revoke all on function public.claim_studio_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_studio_checkout(uuid,text) to service_role;
notify pgrst,'reload schema';
