-- Removing a staff member must revoke account access in the same transaction.
create or replace function public.archive_staff_member(
  _staff_id uuid,
  _reassign_future_to uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_target public.staff%rowtype;
  v_booking_count integer;
  v_moved integer := 0;
begin
  select * into v_staff from public.staff where id = _staff_id for update;
  if v_staff.id is null then
    raise exception 'Staff member not found';
  end if;
  if not (
    public.is_business_owner(v_staff.business_id)
    or public.has_business_permission(v_staff.business_id, 'staff.manage')
  ) then
    raise exception 'Not authorised';
  end if;

  if _reassign_future_to is not null then
    select * into v_target from public.staff where id = _reassign_future_to for update;
    if v_target.id is null
      or v_target.business_id <> v_staff.business_id
      or v_target.id = v_staff.id
      or not v_target.active
      or v_target.archived_at is not null then
      raise exception 'Replacement staff member must be active in the same business';
    end if;
    update public.bookings
      set staff_id = v_target.id
      where staff_id = v_staff.id
        and starts_at >= now()
        and status <> 'cancelled';
    get diagnostics v_moved = row_count;
  end if;

  update public.staff_memberships
    set active = false, updated_at = now()
    where staff_id = v_staff.id and active;
  update public.staff_account_invitations
    set revoked_at = now()
    where staff_id = v_staff.id
      and accepted_at is null
      and revoked_at is null;

  select count(*)::integer into v_booking_count
  from public.bookings where staff_id = v_staff.id;
  if v_booking_count = 0 then
    delete from public.staff where id = v_staff.id;
  else
    update public.staff
      set archived_at = coalesce(archived_at, now()), active = false, bookable = false
      where id = v_staff.id;
  end if;

  return v_moved;
end;
$$;

revoke all on function public.archive_staff_member(uuid, uuid)
from public, anon;
grant execute on function public.archive_staff_member(uuid, uuid)
to authenticated;
