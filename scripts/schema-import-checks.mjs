import assert from 'node:assert/strict';

export async function checkAppointmentImports(db) {
  const id = n => '81000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const [owner, other, business, otherBusiness, staff, service, foreignService, batch] = [1,2,3,4,5,6,7,8].map(id);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims','{}',false)");
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values('${owner}','import-owner@example.invalid',now()),('${other}','other-import@example.invalid',now());
    insert into businesses(id,owner_id,name,slug,plan) values('${business}','${owner}','Import fixture','import-fixture','studio'),('${otherBusiness}','${other}','Other import','other-import','studio');
    insert into staff(id,business_id,name,active,bookable) values('${staff}','${business}','Retired staff',false,false);
    insert into services(id,business_id,name,active) values('${service}','${business}','Retired service',false),('${foreignService}','${otherBusiness}','Foreign service',false);
  `);
  const login = async user => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role:'authenticated',sub:user,aal:'aal1'})]);
    await db.exec('set role authenticated');
  };
  await login(owner);
  await db.query("insert into import_batches(id,business_id,session_id,entity_type,source_filename,file_hash,row_count,created_by) values($1,$2,$3,'bookings','fixture.csv','fixture-hash',10,$4)", [batch,business,id(9),owner]);
  assert.equal((await db.query('select status from import_batches where id=$1',[batch])).rows[0].status,'processing');
  const insert = (n, overrides={}) => {
    const row = {id:id(n),business_id:business,staff_id:staff,service_id:service,customer_name:'Fixture',starts_at:'2030-01-06T03:00:00Z',ends_at:'2030-01-06T04:00:00Z',status:'confirmed',source:'manual',notify_customer:false,confirmation_sent_at:'2026-01-01T00:00:00Z',external_id:'fixture-'+n,import_batch_id:batch,...overrides};
    const cols=Object.keys(row);
    return db.query('insert into bookings('+cols.join(',')+') values('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(row));
  };
  // Future, retired staff/service, outside hours, with an overlapping source row.
  await insert(10); await insert(11);
  assert.equal((await db.query('select count(*)::int n from bookings where business_id=$1',[business])).rows[0].n,2);
  await assert.rejects(insert(12,{service_id:foreignService}),/same workspace/);
  await assert.rejects(insert(13,{ends_at:'2030-01-06T02:00:00Z'}),/duration/);
  await assert.rejects(insert(14,{external_id:''}),/unavailable|SLOT_TAKEN/);
  await assert.rejects(insert(15,{external_id:'fixture-10'}),/duplicate key/);
  await assert.rejects(insert(16,{import_batch_id:null,external_id:null}),/unavailable|SLOT_TAKEN/);
  await assert.rejects(db.query("update bookings set starts_at='2030-01-07T03:00:00Z',ends_at='2030-01-07T04:00:00Z' where id=$1",[id(10)]),/unavailable|SLOT_TAKEN/);
  await db.query("update import_batches set status='completed',imported_count=2 where id=$1",[batch]);
  await assert.rejects(insert(17),/unavailable|SLOT_TAKEN/);
  await db.query("update import_batches set status='processing' where id=$1",[batch]);
  await login(other);
  await assert.rejects(insert(18),/unavailable|SLOT_TAKEN|row-level security/);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims','{}',false)");
  await db.exec(`update staff set active=true,bookable=true where id='${staff}';update services set active=true where id='${service}';`);
  await login(owner);
  await assert.rejects(insert(19,{import_batch_id:null,external_id:null,starts_at:'2030-01-06T03:30:00Z',ends_at:'2030-01-06T04:30:00Z'}),/SLOT_TAKEN/);
  await assert.rejects(insert(20,{import_batch_id:null,external_id:null,starts_at:'2030-01-07T03:00:00Z',ends_at:'2030-01-07T04:00:00Z'}),/hours/);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims','{}',false)");
  await db.query('delete from businesses where id in ($1,$2)',[business,otherBusiness]);
  await db.query('delete from auth.users where id in ($1,$2)',[owner,other]);
  console.log('Appointment imports: retired services/staff, hours, overlaps, isolation, durations, duplicates, closed batches and normal scheduling passed.');
}
