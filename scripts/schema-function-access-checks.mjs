import assert from 'node:assert/strict';
export async function checkFunctionAccess(db) {
 let checks=0;const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
 await db.exec('reset role');
 const signatures=['accept_professional_invitation(text,uuid)','customer_export_stats(uuid)','customer_visit_counts(uuid)','get_portal_bookings()','get_portal_customer_records()','request_customer_data_action(text)','revoke_staff_account_invitation(uuid)'];
 for(const signature of signatures) {
  const {rows}=await db.query("select has_function_privilege('anon',$1,'execute') as anonymous,has_function_privilege('authenticated',$1,'execute') as member",['public.'+signature]);
  same(rows[0],{anonymous:false,member:true});
 }
 const {rows}=await db.query("select has_function_privilege('anon','public.notification_preference_enabled(uuid,text)','execute') as anonymous,has_function_privilege('authenticated','public.notification_preference_enabled(uuid,text)','execute') as member,has_function_privilege('service_role','public.notification_preference_enabled(uuid,text)','execute') as server");
 same(rows[0],{anonymous:false,member:false,server:true});
 const business='10000000-0000-4000-8000-000000000101';
 const before=(await db.query("select count(*)::int as n from notifications where business_id=$1 and type='payment_failed'",[business])).rows[0].n;
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 await db.query("update bookings set payment_status='failed' where id='10000000-0000-4000-8000-000000000501'");
 const after=(await db.query("select count(*)::int as n from notifications where business_id=$1 and type='payment_failed'",[business])).rows[0].n;
 same(after,before+1);
 console.log(`Function access: ${checks} assertions passed, including notification trigger delivery to the local feed.`);
}
