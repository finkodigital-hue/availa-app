begin;

-- Unlinking must retain the rent record, rather than cascading it away.
revoke delete on public.salon_professionals, public.rent_payments from authenticated;

-- A salon must not grant itself permissions that the professional withdrew.
create or replace function public.enforce_salon_professionals_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.id is distinct from old.id or new.created_at is distinct from old.created_at or new.salon_business_id is distinct from old.salon_business_id or new.pro_business_id is distinct from old.pro_business_id then
  raise exception 'Professional link business identities are immutable';
 end if;
 if new.permissions is distinct from old.permissions and (jsonb_typeof(new.permissions)<>'object' or exists(select 1 from jsonb_each(new.permissions) p where jsonb_typeof(p.value)<>'boolean')) then
  raise exception 'Sharing permissions must be true or false';
 end if;
 if new.permissions is distinct from old.permissions and not public.is_business_owner(old.pro_business_id) then
  raise exception 'Only the professional can change the permissions they grant';
 end if;
 if public.is_business_owner(old.salon_business_id) then return new; end if;
 if (to_jsonb(new) - 'permissions' - 'updated_at') is distinct from (to_jsonb(old) - 'permissions' - 'updated_at') then
  raise exception 'Only the salon owner can change these fields';
 end if;
 return new;
end;$$;
revoke all on function public.enforce_salon_professionals_update() from public,anon,authenticated;

alter table public.rent_payments add column if not exists request_id uuid;
alter table public.rent_payments add column if not exists currency text;
create unique index if not exists rent_payments_request_id_idx on public.rent_payments(request_id) where request_id is not null;

create or replace function public.guard_rent_payment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_currency text;
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.salon_professional_id is distinct from old.salon_professional_id or new.request_id is distinct from old.request_id or new.currency is distinct from old.currency then
   raise exception 'Rent payment identity and currency are immutable';
  end if;
 end if;
 if tg_op='UPDATE' and row(new.period_start,new.period_end,new.amount_cents,new.due_date) is distinct from row(old.period_start,old.period_end,old.amount_cents,old.due_date) then
  raise exception 'Recorded rent amounts and periods are immutable; waive an incorrect entry and add a corrected one';
 end if;
 if tg_op='INSERT' or row(new.period_start,new.period_end) is distinct from row(old.period_start,old.period_end) then
  if new.period_end <= new.period_start then raise exception 'Rent period end must be after its start'; end if;
 end if;
 if tg_op='INSERT' or new.amount_cents is distinct from old.amount_cents then
  if new.amount_cents <= 0 then raise exception 'Rent amount must be positive'; end if;
 end if;
 if tg_op='INSERT' then
  select upper(coalesce(b.currency,'GBP')) into v_currency from public.salon_professionals sp join public.businesses b on b.id=sp.salon_business_id where sp.id=new.salon_professional_id;
  if new.currency is not null and upper(new.currency) <> v_currency then raise exception 'Rent currency must match the salon'; end if;
  new.currency := v_currency;
 end if;
 if new.status <> 'paid' then new.paid_at:=null;
 elsif new.paid_at is null then new.paid_at:=now(); end if;
 return new;
end;$$;
revoke all on function public.guard_rent_payment() from public,anon,authenticated;
create trigger rent_payment_validity before insert or update on public.rent_payments for each row execute function public.guard_rent_payment();

-- Period boundaries are start-inclusive and end-exclusive, as in the original
-- generator. Keep old rows intact; use a request ID to make retries safe.
create or replace function public.generate_rent_payment(_link_id uuid, _request_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare
 v_link public.salon_professionals%rowtype;
 v_start date; v_end date; v_anchor date; v_today date; v_month date; v_id uuid;
 v_zone text; v_last_start date; v_due date;
begin
 if _request_id is null then raise exception 'Refresh Bookzenvo before generating rent: a request ID is required'; end if;
 select * into v_link from public.salon_professionals where id=_link_id for update;
 if v_link.id is null then raise exception 'Professional link not found'; end if;
 if not public.is_business_owner(v_link.salon_business_id) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.businesses where id=v_link.salon_business_id and plan='studio') then raise exception 'This feature is on the Studio plan.'; end if;
 if _request_id is not null then
  select id into v_id from public.rent_payments where salon_professional_id=_link_id and request_id=_request_id;
  if v_id is not null then return v_id; end if;
 end if;
 if v_link.status <> 'active' then raise exception 'Rent agreement is not active'; end if;
 if v_link.rent_mode not in ('weekly','monthly') then raise exception 'Only weekly or monthly rent can be generated; record commission manually'; end if;
 if coalesce(v_link.rent_amount_cents,0)<=0 then raise exception 'Rent amount must be positive'; end if;
 if v_link.rent_due_day is not null then raise exception 'A custom rent due day needs a manual entry'; end if;
 select coalesce(timezone,'Europe/London') into v_zone from public.businesses where id=v_link.salon_business_id;
 v_today := (now() at time zone v_zone)::date;
 v_anchor := coalesce(v_link.agreement_start,(v_link.created_at at time zone v_zone)::date);
 select period_start,period_end into v_last_start,v_start from public.rent_payments where salon_professional_id=_link_id order by period_end desc,period_start desc,id desc limit 1;
 v_start:=coalesce(v_start,v_anchor);
 if v_link.rent_mode='weekly' then v_end:=v_start+7;
 else
  v_month:=(date_trunc('month',v_start)+interval '1 month')::date;
  v_end:=v_month + least(extract(day from v_anchor)::int,extract(day from (v_month+interval '1 month - 1 day'))::int)-1;
 end if;
 if v_start < v_anchor then raise exception 'Review historical rent periods before generating'; end if;
 if v_end > v_today then raise exception 'NOTHING_DUE'; end if;
 if v_link.agreement_end is not null and v_end > v_link.agreement_end+1 then raise exception 'Agreement ended; record any final partial period manually'; end if;
 insert into public.rent_payments(salon_professional_id,period_start,period_end,amount_cents,due_date,status,request_id)
 values(_link_id,v_start,v_end,v_link.rent_amount_cents,v_end,'due',_request_id) returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.generate_rent_payment(uuid,uuid) from public,anon;
grant execute on function public.generate_rent_payment(uuid,uuid) to authenticated,service_role;

create or replace function public.generate_rent_payment(_link_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
begin
 raise exception 'Refresh Bookzenvo before generating rent: this version of the page is out of date';
end;
$$;
revoke all on function public.generate_rent_payment(uuid) from public,anon;
grant execute on function public.generate_rent_payment(uuid) to authenticated,service_role;


-- Cross-business writes stay unavailable until a narrow action API exists.
CREATE OR REPLACE FUNCTION private.salon_pro_permission(_pro_business_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT _perm = 'salon_can_view_calendar' AND EXISTS (
 SELECT 1 FROM public.salon_professionals sp JOIN public.businesses b ON b.id=sp.salon_business_id
 WHERE sp.pro_business_id=_pro_business_id AND sp.status='active' AND b.owner_id=auth.uid() AND b.plan='studio'
 AND COALESCE(sp.permissions->>'salon_can_view_calendar','true')='true');
$$;
REVOKE ALL ON FUNCTION private.salon_pro_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.salon_pro_permission(uuid,text) TO authenticated,service_role;
-- The retired public helper is still called by legacy booking triggers.
CREATE OR REPLACE FUNCTION public.salon_pro_permission(_pro_business_id uuid,_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.salon_pro_permission(_pro_business_id,_perm);
$$;
REVOKE ALL ON FUNCTION public.salon_pro_permission(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salon_pro_permission(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.get_linked_professional_busy_times(_salon_id uuid,_starts_at timestamptz,_ends_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.session_has_required_assurance() THEN RAISE EXCEPTION 'Email or two-factor verification required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE businesses.id=_salon_id AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Salon owner required'; END IF;
 PERFORM public.require_studio_business(_salon_id);
 IF _starts_at IS NULL OR _ends_at IS NULL OR _ends_at<=_starts_at OR _ends_at-_starts_at>interval '32 days' THEN RAISE EXCEPTION 'Choose a calendar range of up to 32 days'; END IF;
 SELECT jsonb_build_object('busy',COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) INTO result FROM (
 SELECT b.id,b.business_id,b.staff_id,b.starts_at,b.ends_at,'booking'::text AS kind FROM public.bookings b
 JOIN public.salon_professionals sp ON sp.pro_business_id=b.business_id AND sp.salon_business_id=_salon_id
 WHERE sp.status='active' AND COALESCE(sp.permissions->>'salon_can_view_calendar','true')='true'
 AND b.status<>'cancelled' AND b.starts_at<_ends_at AND b.ends_at>_starts_at
 UNION ALL
 SELECT b.id,b.business_id,b.staff_id,b.starts_at,b.ends_at,'block'::text FROM public.blocked_dates b
 JOIN public.salon_professionals sp ON sp.pro_business_id=b.business_id AND sp.salon_business_id=_salon_id
 WHERE sp.status='active' AND COALESCE(sp.permissions->>'salon_can_view_calendar','true')='true'
 AND b.starts_at<_ends_at AND b.ends_at>_starts_at LIMIT 10001) x;
 IF jsonb_array_length(result->'busy')>10000 THEN RAISE EXCEPTION 'Choose a shorter calendar range'; END IF;
 RETURN result || jsonb_build_object('staff',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'business_id',s.business_id,'name',s.name,'photo_url',s.photo_url))
 FROM public.staff s JOIN public.salon_professionals sp ON sp.pro_business_id=s.business_id AND sp.salon_business_id=_salon_id
 WHERE sp.status='active' AND COALESCE(sp.permissions->>'salon_can_view_calendar','true')='true'), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_linked_professional_busy_times(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_linked_professional_busy_times(uuid,timestamptz,timestamptz) TO authenticated;
drop function if exists public.get_invitation_by_token(text);
create function public.get_invitation_by_token(_token text)
returns table(
  id uuid,salon_business_id uuid,chair_label text,rent_mode text,
  rent_amount_cents integer,commission_percent numeric,agreement_start date,
  agreement_end date,rent_due_day smallint,message text,expires_at timestamptz,
  salon_name text,salon_logo_url text,salon_currency text
)
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select pi.id,pi.salon_business_id,pi.chair_label,pi.rent_mode,
    pi.rent_amount_cents,pi.commission_percent,pi.agreement_start,
    pi.agreement_end,pi.rent_due_day,pi.message,pi.expires_at,b.name,b.logo_url,coalesce(b.currency,'GBP')
  from public.professional_invitations pi join public.businesses b on b.id=pi.salon_business_id
  where pi.token=_token and pi.status='pending' and pi.expires_at>now() limit 1;
$$;
revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon,authenticated,service_role;


create or replace function public.accept_professional_invitation(
  _token text,
  _pro_business_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_invite public.professional_invitations%rowtype;
  v_owner uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid();

  select * into v_invite
  from public.professional_invitations
  where token = _token
    and status = 'pending'
    and expires_at > now()
  for update;

  if v_invite.id is null then
    raise exception 'Invitation is no longer valid';
  end if;

  if v_email is distinct from lower(v_invite.email) then
    raise exception 'Sign in with the invited email address';
  end if;

  if v_invite.salon_business_id = _pro_business_id then
    raise exception 'A business cannot rent a chair from itself';
  end if;

  select b.owner_id into v_owner
  from public.businesses b
  where b.id = _pro_business_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'You do not own this business';
  end if;

  perform 1 from public.salon_professionals where salon_business_id=v_invite.salon_business_id and pro_business_id=_pro_business_id for update;
  if found then raise exception 'This professional already has a link with this salon. Review the existing agreement instead of accepting another invitation'; end if;
  insert into public.salon_professionals (
    salon_business_id, pro_business_id, status, chair_label, rent_mode,
    rent_amount_cents, commission_percent, agreement_start, agreement_end,
    rent_due_day
  ) values (
    v_invite.salon_business_id, _pro_business_id, 'active',
    v_invite.chair_label, v_invite.rent_mode, v_invite.rent_amount_cents,
    v_invite.commission_percent, v_invite.agreement_start,
    v_invite.agreement_end, v_invite.rent_due_day
  );

  update public.professional_invitations
  set status = 'accepted',
      accepted_at = now(),
      accepted_business_id = _pro_business_id
  where id = v_invite.id;

  return v_invite.id;
end;
$$;


-- This helper remains callable only through verified invitation acceptance.
REVOKE ALL ON FUNCTION public.accept_professional_invitation(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_professional_invitation(text,uuid) TO service_role;

-- Validate new/changed agreement values without rewriting legacy records.
CREATE OR REPLACE FUNCTION public.guard_chair_rent_terms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND row(new.rent_mode,new.rent_amount_cents,new.commission_percent,new.agreement_start,new.agreement_end,new.rent_due_day) IS NOT DISTINCT FROM row(old.rent_mode,old.rent_amount_cents,old.commission_percent,old.agreement_start,old.agreement_end,old.rent_due_day) THEN RETURN new; END IF;
 IF new.rent_amount_cents IS NOT NULL AND new.rent_amount_cents<=0 THEN RAISE EXCEPTION 'Rent amount must be positive'; END IF;
 IF new.commission_percent IS NOT NULL AND (new.commission_percent<0 OR new.commission_percent>100) THEN RAISE EXCEPTION 'Commission must be between 0 and 100'; END IF;
 IF new.agreement_start IS NOT NULL AND new.agreement_end IS NOT NULL AND new.agreement_end<new.agreement_start THEN RAISE EXCEPTION 'Agreement end must not precede its start'; END IF;
 IF new.rent_due_day IS NOT NULL AND (new.rent_due_day<1 OR new.rent_due_day>31) THEN RAISE EXCEPTION 'Rent due day must be between 1 and 31'; END IF;
 RETURN new;
END;$$;
REVOKE ALL ON FUNCTION public.guard_chair_rent_terms() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER chair_terms_validity BEFORE INSERT OR UPDATE ON public.salon_professionals FOR EACH ROW EXECUTE FUNCTION public.guard_chair_rent_terms();
CREATE TRIGGER chair_invite_terms_validity BEFORE INSERT OR UPDATE ON public.professional_invitations FOR EACH ROW EXECUTE FUNCTION public.guard_chair_rent_terms();

COMMIT;
NOTIFY pgrst,'reload schema';

