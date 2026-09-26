-- A professional invitation is addressed to one email address. Possession of
-- the link alone must not let a different signed-in business claim it. Lock the
-- invitation row as it is consumed so two concurrent accepts cannot both win.
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

  insert into public.salon_professionals (
    salon_business_id, pro_business_id, status, chair_label, rent_mode,
    rent_amount_cents, commission_percent, agreement_start, agreement_end,
    rent_due_day
  ) values (
    v_invite.salon_business_id, _pro_business_id, 'active',
    v_invite.chair_label, v_invite.rent_mode, v_invite.rent_amount_cents,
    v_invite.commission_percent, v_invite.agreement_start,
    v_invite.agreement_end, v_invite.rent_due_day
  ) on conflict do nothing;

  update public.professional_invitations
  set status = 'accepted',
      accepted_at = now(),
      accepted_business_id = _pro_business_id
  where id = v_invite.id;

  return v_invite.id;
end;
$$;

revoke all on function public.accept_professional_invitation(text, uuid)
  from public, anon;
grant execute on function public.accept_professional_invitation(text, uuid)
  to authenticated;
