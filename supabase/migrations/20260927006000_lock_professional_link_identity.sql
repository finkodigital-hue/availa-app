begin;

-- A professional link is created only after the invited professional accepts
-- the email-bound invitation. Direct browser inserts allowed a salon owner to
-- link any other business and inherit the permissions attached to that link.
revoke insert on table public.salon_professionals from authenticated;

drop policy if exists "salon owners insert professional links"
  on public.salon_professionals;

-- Keep the browser-facing edits used by the salon terms editor and the
-- professional permissions editor, but never allow either business identity
-- to be changed through PostgREST.
revoke update on table public.salon_professionals from authenticated;
grant update (
  status,
  chair_label,
  color,
  display_order,
  permissions,
  rent_mode,
  rent_amount_cents,
  commission_percent,
  agreement_start,
  agreement_end,
  rent_due_day
) on table public.salon_professionals to authenticated;

create or replace function public.enforce_salon_professionals_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The invitation acceptance function is the only path that establishes
  -- these identities. Existing links must never be retargeted.
  if new.salon_business_id is distinct from old.salon_business_id
     or new.pro_business_id is distinct from old.pro_business_id
  then
    raise exception 'Professional link business identities are immutable';
  end if;

  -- The salon owner may edit the commercial terms of its existing link.
  if public.is_business_owner(old.salon_business_id) then
    return new;
  end if;

  -- The professional may only edit the permissions they grant to the salon.
  if new.status is distinct from old.status
     or new.chair_label is distinct from old.chair_label
     or new.color is distinct from old.color
     or new.display_order is distinct from old.display_order
     or new.rent_mode is distinct from old.rent_mode
     or new.rent_amount_cents is distinct from old.rent_amount_cents
     or new.commission_percent is distinct from old.commission_percent
     or new.agreement_start is distinct from old.agreement_start
     or new.agreement_end is distinct from old.agreement_end
     or new.rent_due_day is distinct from old.rent_due_day
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only the salon owner can change these fields';
  end if;

  return new;
end
$$;

revoke execute on function public.enforce_salon_professionals_update()
  from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
