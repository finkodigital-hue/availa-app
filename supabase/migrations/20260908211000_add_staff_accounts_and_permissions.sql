-- Individual employee accounts. Independent salon_professionals intentionally
-- remain separate: they own another business; these memberships act inside one.
create table public.staff_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_role text not null check (access_role in ('manager','front_desk','practitioner')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id), unique (staff_id)
);

create table public.staff_account_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  email text not null,
  access_role text not null check (access_role in ('manager','front_desk','practitioner')),
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index staff_account_one_pending_invite
  on public.staff_account_invitations(staff_id)
  where accepted_at is null and revoked_at is null;
create index staff_memberships_user on public.staff_memberships(user_id) where active;

alter table public.staff_memberships enable row level security;
alter table public.staff_account_invitations enable row level security;
grant select, update, delete on public.staff_memberships to authenticated;
grant select on public.staff_account_invitations to authenticated;
grant all on public.staff_memberships, public.staff_account_invitations to service_role;

create or replace function public.has_business_permission(_business_id uuid, _permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from businesses b where b.id=_business_id and b.owner_id=auth.uid())
  or exists(
    select 1 from staff_memberships m
    where m.business_id=_business_id and m.user_id=auth.uid() and m.active
      and case m.access_role
        when 'manager' then _permission = any(array['workspace.read','calendar.manage','customers.manage','services.manage','staff.manage','inventory.manage','reports.read'])
        when 'front_desk' then _permission = any(array['workspace.read','calendar.manage','customers.manage'])
        when 'practitioner' then _permission = any(array['workspace.read','calendar.read'])
        else false end
  );
$$;
revoke all on function public.has_business_permission(uuid,text) from public, anon;
grant execute on function public.has_business_permission(uuid,text) to authenticated;

create or replace function public.is_business_member(_business_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.has_business_permission(_business_id,'workspace.read')
$$;
revoke all on function public.is_business_member(uuid) from public, anon;
grant execute on function public.is_business_member(uuid) to authenticated;

create policy "members read own membership" on public.staff_memberships for select to authenticated
 using (user_id=auth.uid() or public.is_business_owner(business_id));
create policy "owners manage memberships" on public.staff_memberships for all to authenticated
 using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy "owners read staff invitations" on public.staff_account_invitations for select to authenticated
 using (public.is_business_owner(business_id));

-- Raw tokens are returned once and only a SHA-256 digest is retained.
create or replace function public.create_staff_account_invitation(_staff_id uuid, _email text, _access_role text)
returns table(invitation_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path=public,extensions as $$
declare v_staff staff%rowtype; v_token text; v_id uuid; v_exp timestamptz := now()+interval '7 days';
begin
 select * into v_staff from staff where id=_staff_id;
 if v_staff.id is null or not public.is_business_owner(v_staff.business_id) then raise exception 'Not authorized'; end if;
 if lower(trim(_email)) = '' then raise exception 'Email is required'; end if;
 if _access_role not in ('manager','front_desk','practitioner') then raise exception 'Invalid access role'; end if;
 if exists(select 1 from staff_memberships where staff_id=_staff_id) then raise exception 'This staff member already has an account'; end if;
 update staff_account_invitations set revoked_at=now() where staff_id=_staff_id and accepted_at is null and revoked_at is null;
 v_token := encode(gen_random_bytes(32),'hex');
 insert into staff_account_invitations(business_id,staff_id,email,access_role,token_hash,expires_at,invited_by)
 values(v_staff.business_id,_staff_id,lower(trim(_email)),_access_role,encode(digest(v_token,'sha256'),'hex'),v_exp,auth.uid()) returning id into v_id;
 return query select v_id,v_token,v_exp;
end $$;
revoke all on function public.create_staff_account_invitation(uuid,text,text) from public,anon;
grant execute on function public.create_staff_account_invitation(uuid,text,text) to authenticated;

create or replace function public.get_staff_account_invitation(_token text)
returns table(business_name text, staff_name text, email text, access_role text, expires_at timestamptz)
language sql stable security definer set search_path=public,extensions as $$
 select b.name,s.name,i.email,i.access_role,i.expires_at from staff_account_invitations i
 join businesses b on b.id=i.business_id join staff s on s.id=i.staff_id
 where i.token_hash=encode(digest(_token,'sha256'),'hex') and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()
$$;
grant execute on function public.get_staff_account_invitation(text) to anon,authenticated;

create or replace function public.accept_staff_account_invitation(_token text)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v staff_account_invitations%rowtype; v_email text;
begin
 if auth.uid() is null then raise exception 'Sign in to accept this invitation'; end if;
 select lower(email) into v_email from auth.users where id=auth.uid();
 select * into v from staff_account_invitations where token_hash=encode(digest(_token,'sha256'),'hex') for update;
 if v.id is null or v.accepted_at is not null or v.revoked_at is not null or v.expires_at<=now() then raise exception 'Invitation is invalid or expired'; end if;
 if v_email is distinct from lower(v.email) then raise exception 'Sign in with the invited email address'; end if;
 insert into staff_memberships(business_id,staff_id,user_id,access_role) values(v.business_id,v.staff_id,auth.uid(),v.access_role);
 update staff_account_invitations set accepted_at=now() where id=v.id;
 return v.business_id;
end $$;
revoke all on function public.accept_staff_account_invitation(text) from public,anon;
grant execute on function public.accept_staff_account_invitation(text) to authenticated;

create or replace function public.revoke_staff_account_invitation(_invitation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin update staff_account_invitations set revoked_at=now() where id=_invitation_id and public.is_business_owner(business_id); if not found then raise exception 'Not authorized'; end if; end $$;
grant execute on function public.revoke_staff_account_invitation(uuid) to authenticated;

-- Staff can discover their workspace, but only owners can mutate its settings.
drop policy if exists "public can view active businesses authed" on public.businesses;
create policy "authenticated can view available businesses" on public.businesses for select to authenticated
 using (deletion_requested_at is null or owner_id=auth.uid());

-- Additive RLS policies preserve all owner/public/customer/professional rules.
create policy "members read staff" on public.staff for select to authenticated using (public.is_business_member(business_id));
create policy "staff managers manage staff" on public.staff for all to authenticated using (public.has_business_permission(business_id,'staff.manage')) with check (public.has_business_permission(business_id,'staff.manage'));
create policy "members read services" on public.services for select to authenticated using (public.is_business_member(business_id));
create policy "staff managers manage services" on public.services for all to authenticated using (public.has_business_permission(business_id,'services.manage')) with check (public.has_business_permission(business_id,'services.manage'));
create policy "members read service staff" on public.service_staff for select to authenticated using (public.is_business_member(business_id));
create policy "staff managers manage service staff" on public.service_staff for all to authenticated using (public.has_business_permission(business_id,'services.manage')) with check (public.has_business_permission(business_id,'services.manage'));
create policy "permitted staff manage customers" on public.customers for all to authenticated using (public.has_business_permission(business_id,'customers.manage')) with check (public.has_business_permission(business_id,'customers.manage'));
create policy "permitted staff manage bookings" on public.bookings for all to authenticated using (public.has_business_permission(business_id,'calendar.manage')) with check (public.has_business_permission(business_id,'calendar.manage'));
create policy "practitioners read own bookings" on public.bookings for select to authenticated using (
  exists(select 1 from public.staff_memberships m where m.user_id=auth.uid() and m.business_id=bookings.business_id and m.staff_id=bookings.staff_id and m.active)
);
create policy "staff managers manage staff hours" on public.staff_hours for all to authenticated using (public.has_business_permission(business_id,'staff.manage')) with check (public.has_business_permission(business_id,'staff.manage'));
create policy "inventory staff manage inventory" on public.inventory_items for all to authenticated using (public.has_business_permission(business_id,'inventory.manage')) with check (public.has_business_permission(business_id,'inventory.manage'));
create policy "permitted staff read bookings" on public.bookings for select to authenticated using (
 public.has_business_permission(business_id,'calendar.manage') or
 (public.has_business_permission(business_id,'calendar.read') and staff_id=(select m.staff_id from staff_memberships m where m.business_id=bookings.business_id and m.user_id=auth.uid() and m.active))
);
create policy "permitted staff create bookings" on public.bookings for insert to authenticated with check (public.has_business_permission(business_id,'calendar.manage'));
create policy "permitted staff update bookings" on public.bookings for update to authenticated using (public.has_business_permission(business_id,'calendar.manage')) with check (public.has_business_permission(business_id,'calendar.manage'));
create policy "permitted staff delete bookings" on public.bookings for delete to authenticated using (public.has_business_permission(business_id,'calendar.manage'));
create policy "members read business hours" on public.business_hours for select to authenticated using (public.is_business_member(business_id));
create policy "staff managers manage business hours" on public.business_hours for all to authenticated using (public.has_business_permission(business_id,'staff.manage')) with check (public.has_business_permission(business_id,'staff.manage'));
create policy "members read blocked dates" on public.blocked_dates for select to authenticated using (public.is_business_member(business_id));
create policy "permitted staff manage blocked dates" on public.blocked_dates for all to authenticated using (public.has_business_permission(business_id,'calendar.manage')) with check (public.has_business_permission(business_id,'calendar.manage'));

create trigger staff_memberships_updated before update on public.staff_memberships for each row execute function public.set_updated_at();
