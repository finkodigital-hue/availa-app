import assert from "node:assert/strict";

// Real role helper, grants and customer functions from the complete migration replay.
export async function checkCustomerDirectory(db) {
  let checks = 0;
  const id = (n) => `e8000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const same = (actual, expected, label) => {
    assert.deepEqual(actual, expected, label);
    checks++;
  };
  const login = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify(
        n
          ? {
              role: "authenticated",
              sub: id(n),
              email: `directory${n}@example.invalid`,
            }
          : { role: "anon" },
      ),
    ]);
    await db.exec(n ? "set role authenticated" : "set role anon");
  };
  await db.exec("reset role; begin");
  await db.query("select set_config('request.jwt.claims','{}',false)");
  try {
    await db.exec(`
      insert into auth.users(id,email,email_confirmed_at) select ('e8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'directory'||n||'@example.invalid',now() from generate_series(1,7) n;
      insert into businesses(id,owner_id,name,slug,email_suppressed,sms_suppressed,plan) values
        ('${id(101)}','${id(1)}','Directory A','directory-a',true,true,'studio'),
        ('${id(102)}','${id(2)}','Directory B','directory-b',true,true,'studio');
      insert into staff(id,business_id,name) select ('e8000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'${id(101)}','Directory staff '||n from generate_series(3,6) n;
      insert into staff_memberships(business_id,staff_id,user_id,access_role,active) values
        ('${id(101)}','${id(203)}','${id(3)}','manager',true),
        ('${id(101)}','${id(204)}','${id(4)}','front_desk',true),
        ('${id(101)}','${id(205)}','${id(5)}','practitioner',true),
        ('${id(101)}','${id(206)}','${id(6)}','manager',false);
      insert into customers(id,business_id,name,email) values ('${id(301)}','${id(101)}','Fictional directory customer','directory-customer@example.invalid');
      insert into services(id,business_id,name,duration_minutes,price_cents) values ('${id(401)}','${id(101)}','Directory service',30,2500);
      insert into bookings(business_id,service_id,staff_id,customer_id,customer_name,starts_at,ends_at,status,price_cents)
      values
        ('${id(101)}','${id(401)}','${id(203)}','${id(301)}','Fictional directory customer',now()-interval '3 days',now()-interval '3 days'+interval '30 minutes','completed',2500),
        ('${id(101)}','${id(401)}','${id(203)}','${id(301)}','Fictional directory customer',now()-interval '2 days',now()-interval '2 days'+interval '30 minutes','completed',2500),
        ('${id(101)}','${id(401)}','${id(203)}','${id(301)}','Fictional directory customer',now()-interval '1 day',now()-interval '1 day'+interval '30 minutes','cancelled',2500),
        ('${id(101)}','${id(401)}','${id(203)}','${id(301)}','Fictional directory customer',now()+interval '1 day',now()+interval '1 day 30 minutes','confirmed',2500);
    `);
    for (const fn of ["customer_visit_counts", "customer_export_stats"]) {
      for (const n of [1, 3, 4]) {
        await login(n);
        const rows = (await db.query(`select * from ${fn}('${id(101)}')`)).rows;
        same(
          rows.map((r) => ({
            customer_id: r.customer_id,
            visits: Number(r.visits),
          })),
          [{ customer_id: id(301), visits: 2 }],
          `${fn}: owner and permitted staff have real visit totals`,
        );
        if (fn === "customer_export_stats")
          same(
            Number(rows[0].total_spent_cents),
            5000,
            "Aggregate preserves existing booked-value definition",
          );
        same(
          (await db.query(`select * from ${fn}('${id(102)}')`)).rows,
          [],
          `${fn}: cannot cross tenant boundary`,
        );
      }
      for (const n of [2, 5, 6, 7]) {
        await login(n);
        same(
          (await db.query(`select * from ${fn}('${id(101)}')`)).rows,
          [],
          `${fn}: unrelated owner/practitioner/inactive member/stranger denied`,
        );
      }
      await login(null);
      // Check privilege without aborting the encompassing fixture transaction.
      same(
        (
          await db.query(
            `select has_function_privilege(current_user,'${fn}(uuid)','execute') as allowed`,
          )
        ).rows[0].allowed,
        false,
        `${fn}: anonymous execution denied`,
      );
    }
    await db.exec("reset role");
    await db.query(
      `update staff_memberships set active=false where user_id='${id(3)}'`,
    );
    await login(3);
    same(
      (await db.query(`select * from customer_export_stats('${id(101)}')`))
        .rows,
      [],
      "Revoking membership removes aggregate access",
    );
    console.log(
      `Customer directory: ${checks} full-schema role, tenant and aggregate assertions passed.`,
    );
  } finally {
    await db.exec("rollback; reset role");
    await db.query("select set_config('request.jwt.claims','{}',false)");
  }
}
