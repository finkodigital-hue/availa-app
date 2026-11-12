import assert from "node:assert/strict";
export async function checkChairRent(db) {
  const id = (n) => `72000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const rows = async (sql, args) => (await db.query(sql, args)).rows;
  let checks = 0;
  const same = (a, b, label) => {
    assert.deepEqual(a, b, label);
    checks++;
  };
  const reject = async (sql, re) => {
    await assert.rejects(() => db.exec(sql), re);
    checks++;
  };
  const login = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        role: "authenticated",
        sub: id(n),
        email: `rent${n}@example.invalid`,
        aal: "aal1",
      }),
    ]);
    await db.exec("set role authenticated");
  };
  const admin = async () => {
    await db.exec(
      "reset role;select set_config('request.jwt.claims','{}',false)",
    );
  };
  await admin();
  same((await rows("select has_function_privilege('anon','private.salon_pro_permission(uuid,text)','EXECUTE') as anon,has_function_privilege('authenticated','private.salon_pro_permission(uuid,text)','EXECUTE') as authenticated,has_function_privilege('service_role','private.salon_pro_permission(uuid,text)','EXECUTE') as service"))[0], {anon:false,authenticated:true,service:true}, 'Private sharing helper has explicit minimal execute grants');
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${id(1)}','rent1@example.invalid',now()),('${id(2)}','rent2@example.invalid',now()),('${id(3)}','rent3@example.invalid',now());
 insert into businesses(id,owner_id,name,slug,plan,timezone) values('${id(101)}','${id(1)}','Rent salon','rent-salon-fixture','studio','Europe/London'),('${id(102)}','${id(2)}','Rent pro','rent-pro-fixture','studio','Europe/London'),('${id(103)}','${id(3)}','Unrelated','rent-other-fixture','studio','Europe/London');
 insert into salon_professionals(id,salon_business_id,pro_business_id,rent_mode,rent_amount_cents,created_at) values('${id(201)}','${id(101)}','${id(102)}','weekly',12345,now()-interval '30 days');`);
  await admin();
  await db.exec(`insert into staff(id,business_id,name) values('${id(301)}','${id(102)}','Shared professional');
 insert into services(id,business_id,name,duration_minutes,price_cents) values('${id(302)}','${id(102)}','Secret treatment',30,1234);
 insert into bookings(id,business_id,staff_id,service_id,customer_name,customer_email,customer_phone,notes,starts_at,ends_at) values('${id(303)}','${id(102)}','${id(301)}','${id(302)}','Private customer','private@example.invalid','00000','Sensitive note',date_trunc('day',now())+interval '10 hours',date_trunc('day',now())+interval '11 hours');
 insert into blocked_dates(id,business_id,staff_id,starts_at,ends_at,reason) values('${id(304)}','${id(102)}','${id(301)}',date_trunc('day',now())+interval '12 hours',date_trunc('day',now())+interval '13 hours','Private medical reason');`);
  const shared = async (salon) =>
    (
      await rows(
        `select get_linked_professional_busy_times('${salon ?? id(101)}',date_trunc('day',now()),date_trunc('day',now())+interval '1 day') as result`,
      )
    )[0].result;
  await login(1);
  same(
    (await rows("select id from bookings")).length,
    0,
    "Shared calendar cannot read full private booking rows",
  );
  same(
    (await rows("select id from blocked_dates")).length,
    0,
    "Shared calendar cannot read private time-off reasons",
  );
  const projection = await shared();
  same(
    projection.busy.length,
    2,
    "Linked bookings and time off appear as busy times",
  );
  same(
    Object.keys(projection.busy[0]).sort(),
    ["id", "business_id", "staff_id", "starts_at", "ends_at", "kind"].sort(),
    "Busy projection exposes no client, money, service or note fields",
  );
  same(
    Object.keys(projection.staff[0]).sort(),
    ["id", "business_id", "name", "photo_url"].sort(),
    "Staff projection exposes no private staff fields",
  );
  same(
    JSON.stringify(projection).includes("Private"),
    false,
    "No customer or time off details leak",
  );
  same(
    (
      await rows(
        `select private.salon_pro_permission('${id(102)}','salon_can_book_pros') as allowed`,
      )
    )[0].allowed,
    false,
    "Shared booking writes are disabled",
  );
  await reject(
    `select get_linked_professional_busy_times('${id(101)}',now(),now()+interval '33 days')`,
    /32 days/,
  );
  await admin();
  await db.exec(
    `insert into auth.mfa_factors(id,user_id,status) values('${id(305)}','${id(1)}','verified')`,
  );
  await login(1);
  await reject(
    `select get_linked_professional_busy_times('${id(101)}',now(),now()+interval '1 day')`,
    /two-factor verification required/,
  );
  await admin();
  await db.exec(`delete from auth.mfa_factors where id='${id(305)}'`);
  await login(3);
  await reject(
    `select get_linked_professional_busy_times('${id(101)}',now(),now()+interval '1 day')`,
    /Salon owner required/,
  );
  await login(2);
  await db.exec(
    `update salon_professionals set permissions=jsonb_set(permissions,'{salon_can_view_calendar}','false') where id='${id(201)}'`,
  );
  await login(1);
  same(
    (await shared()).busy.length,
    0,
    "Withdrawing visibility removes all busy times",
  );
  await login(2);
  await reject(
    `update salon_professionals set rent_amount_cents=1 where id='${id(201)}'`,
    /Only the salon owner/,
  );
  await login(1);
  await reject(
    `update salon_professionals set permissions=jsonb_set(permissions,'{salon_can_view_calendar}','true') where id='${id(201)}'`,
    /professional.*permission/i,
  );
  await reject(
    `update salon_professionals set rent_amount_cents=-1 where id='${id(201)}'`,
    /amount must be positive/,
  );
  await reject(
    `update salon_professionals set commission_percent=101 where id='${id(201)}'`,
    /between 0 and 100/,
  );
  await reject(
    `update salon_professionals set rent_due_day=32 where id='${id(201)}'`,
    /between 1 and 31/,
  );
  await reject(
    `update salon_professionals set agreement_start='2026-12-01',agreement_end='2026-11-01' where id='${id(201)}'`,
    /end must not precede/,
  );
  await reject(`select generate_rent_payment('${id(201)}')`,/Refresh Bookzenvo/);
  await reject(`select generate_rent_payment('${id(201)}',null::uuid)`,/request ID is required/);
  same((await rows('select count(*)::int n from rent_payments'))[0].n,0,'Legacy or null-key callers cannot create rent entries');
  const first = (
    await rows(`select generate_rent_payment('${id(201)}','${id(401)}') as id`)
  )[0].id;
  await reject(`update rent_payments set amount_cents=1 where id='${first}'`, /amounts and periods are immutable/);
  await reject(`update salon_professionals set created_at=now()-interval '90 days' where id='${id(201)}'`, /identities are immutable|permission denied/);
  const firstRow = (
    await rows(
      `select amount_cents,currency,(period_end-period_start)::int as days from rent_payments where id='${first}'`,
    )
  )[0];
  same(
    firstRow,
    { amount_cents: 12345, currency: "GBP", days: 7 },
    "UI-created agreement accrues from creation date",
  );
  same(
    (
      await rows(
        `select generate_rent_payment('${id(201)}','${id(401)}') as id`,
      )
    )[0].id,
    first,
    "Same request returns the original row",
  );
  same(
    (await rows(`select count(*)::int n from rent_payments`))[0].n,
    1,
    "No retry duplicate",
  );
  await reject(
    `delete from rent_payments where id='${first}'`,
    /permission denied/,
  );
  await reject(
    `delete from salon_professionals where id='${id(201)}'`,
    /permission denied/,
  );
  await db.exec(
    `update salon_professionals set status='ended' where id='${id(201)}'`,
  );
  same(
    (
      await rows(
        `select count(*)::int n from rent_payments where id='${first}'`,
      )
    )[0].n,
    1,
    "Ending relationship keeps history",
  );
  await reject(
    `select generate_rent_payment('${id(201)}','${id(402)}')`,
    /not active/,
  );
  same(
    (
      await rows(
        `select generate_rent_payment('${id(201)}','${id(401)}') as id`,
      )
    )[0].id,
    first,
    "Successful request replay survives ending the link",
  );
  await admin();
  await db.exec(
    `insert into professional_invitations(id,salon_business_id,invited_by,email,token) values('${id(306)}','${id(101)}','${id(1)}','rent2@example.invalid','rent-reinvite-fixture')`,
  );
  await login(2);
  await reject(
    `select accept_professional_invitation_with_workspace('rent-reinvite-fixture','','','Europe/London','2026-09-26')`,
    /already has a link/,
  );
  same(
    (
      await rows(
        `select count(*)::int n from rent_payments where id='${first}'`,
      )
    )[0].n,
    1,
    "Professional retains historical read access",
  );
  await reject(
    `insert into rent_payments(salon_professional_id,period_start,period_end,amount_cents) values('${id(201)}','2024-01-01','2024-01-08',100)`,
    /row-level security/,
  );
  same(
    (
      await rows(
        `update rent_payments set status='paid' where id='${first}' returning id`,
      )
    ).length,
    0,
    "Professional cannot mark paid",
  );
  await login(3);
  same(
    (
      await rows(
        `select count(*)::int n from rent_payments where id='${first}'`,
      )
    )[0].n,
    0,
    "Other salon cannot read ledger",
  );
  await reject(
    `select generate_rent_payment('${id(201)}','${id(403)}')`,
    /not found/,
  );
  await login(1);
  await reject(
    `insert into rent_payments(salon_professional_id,period_start,period_end,amount_cents) values('${id(201)}','2024-01-08','2024-01-01',100)`,
    /end must be after/,
  );
  await reject(
    `insert into rent_payments(salon_professional_id,period_start,period_end,amount_cents) values('${id(201)}','2024-01-01','2024-01-01',100)`,
    /end must be after/,
  );
  for (const amount of [0, -1])
    await reject(
      `insert into rent_payments(salon_professional_id,period_start,period_end,amount_cents) values('${id(201)}','2024-01-01','2024-01-08',${amount})`,
      /amount must be positive/,
    );
  await reject(
    `insert into rent_payments(salon_professional_id,period_start,period_end,amount_cents,currency) values('${id(201)}','2024-01-01','2024-01-08',100,'USD')`,
    /currency must match/,
  );
  await reject(
    `update rent_payments set currency='USD' where id='${first}'`,
    /immutable/,
  );
  await reject(
    `update rent_payments set request_id='${id(405)}' where id='${first}'`,
    /immutable/,
  );
  await db.exec(
    `update rent_payments set status='paid',paid_at=null where id='${first}'`,
  );
  same(
    (
      await rows(
        `select paid_at is not null paid from rent_payments where id='${first}'`,
      )
    )[0].paid,
    true,
    "Paid date created",
  );
  await db.exec(`update rent_payments set status='waived' where id='${first}'`);
  same(
    (await rows(`select paid_at from rent_payments where id='${first}'`))[0]
      .paid_at,
    null,
    "Waiver clears paid timestamp",
  );
  await db.exec(`update rent_payments set status='due' where id='${first}'`);
  same(
    (await rows(`select paid_at from rent_payments where id='${first}'`))[0]
      .paid_at,
    null,
    "Reopen clears paid timestamp",
  );
  await admin();
  await db.exec(
    `delete from rent_payments where salon_professional_id='${id(201)}'`,
  );
  await login(1);
  await db.exec(
    `update salon_professionals set status='active',rent_mode='monthly',agreement_start='2024-01-31' where id='${id(201)}'`,
  );
  await login(1);
  const monthly = [];
  for (let i = 0; i < 3; i++) {
    const r = (
      await rows(
        `select generate_rent_payment('${id(201)}','${id(410 + i)}') id`,
      )
    )[0];
    monthly.push(
      (
        await rows(
          `select period_start::text,period_end::text from rent_payments where id='${r.id}'`,
        )
      )[0],
    );
  }
  same(
    monthly,
    [
      { period_start: "2024-01-31", period_end: "2024-02-29" },
      { period_start: "2024-02-29", period_end: "2024-03-31" },
      { period_start: "2024-03-31", period_end: "2024-04-30" },
    ],
    "Leap-year/month-end anchor recovers after February",
  );
  await db.exec(
    `update salon_professionals set agreement_end='2024-04-30' where id='${id(201)}'`,
  );
  await reject(
    `select generate_rent_payment('${id(201)}','${id(420)}')`,
    /Agreement ended/,
  );
  await db.exec(
    `update salon_professionals set agreement_end=null,rent_due_day=15 where id='${id(201)}'`,
  );
  await reject(
    `select generate_rent_payment('${id(201)}','${id(421)}')`,
    /custom rent due day needs a manual entry/,
  );
  await db.exec(
    `update salon_professionals set rent_due_day=null,rent_mode='percentage' where id='${id(201)}'`,
  );
  await reject(
    `select generate_rent_payment('${id(201)}','${id(422)}')`,
    /record commission manually/,
  );
  await db.exec(
    `update salon_professionals set rent_mode='weekly',rent_amount_cents=null where id='${id(201)}'`,
  );
  await reject(
    `select generate_rent_payment('${id(201)}','${id(423)}')`,
    /amount must be positive/,
  );
  await admin();
  await db.exec(`update businesses set plan='free' where id='${id(101)}'`);
  await login(1);
  await reject(`select get_linked_professional_busy_times('${id(101)}',now(),now()+interval '1 day')`,/Studio plan/);
  same((await rows(`select private.salon_pro_permission('${id(102)}','salon_can_view_calendar') as allowed`))[0].allowed,false,'Free downgrade blocks shared calendar permission');
  await reject(
    `select generate_rent_payment('${id(201)}','${id(424)}')`,
    /Studio plan/,
  );
  await reject(
    `update rent_payments set status='paid' where salon_professional_id='${id(201)}'`,
    /Studio plan/,
  );
  await admin();
  await db.exec(
    `update businesses set plan='studio' where id='${id(101)}';delete from rent_payments where salon_professional_id='${id(201)}'`,
  );
  await login(1);
  await db.exec(
    `update salon_professionals set rent_amount_cents=12345,agreement_start=(now() at time zone 'Europe/London')::date where id='${id(201)}'`,
  );
  await login(1);
  await reject(
    `select generate_rent_payment('${id(201)}','${id(425)}')`,
    /NOTHING_DUE/,
  );
  await admin();
  await db.exec(
    `delete from businesses where id in('${id(101)}','${id(102)}','${id(103)}'); delete from auth.users where id in('${id(1)}','${id(2)}','${id(3)}');select set_config('request.jwt.claims','{}',false);`,
  );
  console.log(
    `${checks} chair rent checks passed: ownership, permissions, history, retries, currency, dates, plan gates and month-end accrual`,
  );
}
