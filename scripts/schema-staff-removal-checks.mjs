import assert from "node:assert/strict";

export async function checkStaffRemoval(db) {
  const owner = "70000000-0000-4000-8000-000000000001";
  const employee = "70000000-0000-4000-8000-000000000002";
  const business = "70000000-0000-4000-8000-000000000003";
  const staff = "70000000-0000-4000-8000-000000000004";
  const service = "70000000-0000-4000-8000-000000000005";
  const booking = "70000000-0000-4000-8000-000000000006";
  const invitation = "70000000-0000-4000-8000-000000000007";

  await db.exec("reset role");
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values
      ('${owner}','staff-removal-owner@example.invalid',now()),
      ('${employee}','staff-removal-employee@example.invalid',now());
    insert into businesses(id,owner_id,name,slug,plan)
      values('${business}','${owner}','Staff removal fixture','staff-removal-fixture','studio');
    insert into staff(id,business_id,name)
      values('${staff}','${business}','Former employee');
    insert into services(id,business_id,name)
      values('${service}','${business}','Fixture service');
    insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at)
      values('${booking}','${business}','${service}','${staff}','Fixture customer',now()-interval '1 day',now()-interval '23 hours');
    insert into staff_memberships(business_id,staff_id,user_id,access_role)
      values('${business}','${staff}','${employee}','manager');
    insert into staff_account_invitations(id,business_id,staff_id,email,access_role,token_hash,invited_by)
      values('${invitation}','${business}','${staff}','pending@example.invalid','front_desk','fixture-token-hash','${owner}');
  `);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      role: "authenticated",
      sub: owner,
      email: "staff-removal-owner@example.invalid",
      aal: "aal1",
    }),
  ]);
  await db.exec("set role authenticated");
  await db.query("select archive_staff_member($1, null)", [staff]);
  await db.exec("reset role");

  const state = (
    await db.query(
      `select s.archived_at is not null as archived, s.active, s.bookable,
        m.active as membership_active, i.revoked_at is not null as invite_revoked
       from staff s
       join staff_memberships m on m.staff_id=s.id
       join staff_account_invitations i on i.staff_id=s.id
       where s.id=$1`,
      [staff],
    )
  ).rows[0];
  assert.deepEqual(state, {
    archived: true,
    active: false,
    bookable: false,
    membership_active: false,
    invite_revoked: true,
  });

  await db.exec(`
    delete from businesses where id='${business}';
    delete from auth.users where id in ('${owner}','${employee}');
  `);
  console.log(
    "Staff removal: archive, membership revocation and invitation revocation passed atomically.",
  );
}
