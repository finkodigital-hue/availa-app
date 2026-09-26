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
 for(const signature of ['is_linked_pro_of(uuid)','merge_customers(uuid,uuid)']) {
  const {rows}=await db.query("select has_function_privilege('anon',$1,'execute') as anonymous,has_function_privilege('authenticated',$1,'execute') as member,has_function_privilege('service_role',$1,'execute') as server",['public.'+signature]);
  same(rows[0],{anonymous:false,member:true,server:true});
 }
 const memberOnly=['adjust_booking_stock_deduction(uuid,numeric)','create_staff_booking(uuid,uuid,uuid,uuid,text,text,text,timestamp with time zone,timestamp with time zone,integer,integer,integer,text,text,boolean,boolean,text,text,text,integer,integer,text)','ensure_business_hours(uuid)','generate_rent_payment(uuid)','move_booking(uuid,timestamp with time zone,timestamp with time zone,uuid)','reassign_staff_bookings(uuid,uuid,boolean)','reschedule_booking(uuid,timestamp with time zone)'];
 for(const signature of memberOnly) {
  const {rows}=await db.query("select has_function_privilege('anon',$1,'execute') as anonymous,has_function_privilege('authenticated',$1,'execute') as member",['public.'+signature]);
  same(rows[0],{anonymous:false,member:true});
 }
 const triggerOnly=['delete_reviews_before_customer_erasure()','enforce_staff_plan_limit()','enforce_staff_plan_limit_on_activate()','enqueue_calendar_sync()','invalidate_tokens_on_reschedule()','notify_booking_cancelled()','notify_booking_created()','notify_consultation_signed()','notify_low_stock()','notify_payment_failed()','record_support_ticket_change()','reset_reminder_state_on_reschedule()','set_google_calendar_connection_updated_at()','sync_booking_to_google_calendar()'];
 for(const signature of triggerOnly) {
  const {rows}=await db.query("select has_function_privilege('anon',$1,'execute') as anonymous,has_function_privilege('authenticated',$1,'execute') as member",['public.'+signature]);
  same(rows[0],{anonymous:false,member:false});
 }
 const {rows:anonymousAppFunctions}=await db.query(`select p.oid::regprocedure::text as signature
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
  order by 1`);
 same(anonymousAppFunctions.map(row=>row.signature),['check_request_assurance()','get_invitation_by_token(text)','get_public_salon_professionals(uuid)','get_staff_account_invitation(text)','session_has_required_assurance()']);
 const {rows:fixedPaths}=await db.query(`select p.proname,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=any($1::text[]) order by p.proname`,[['adjust_booking_stock_deduction','invalidate_tokens_on_reschedule','reset_reminder_state_on_reschedule','set_google_calendar_connection_updated_at']]);
 same(fixedPaths.map(row=>({name:row.proname,config:row.proconfig})),[
  {name:'adjust_booking_stock_deduction',config:['search_path=public, pg_temp']},
  {name:'invalidate_tokens_on_reschedule',config:['search_path=public, pg_temp']},
  {name:'reset_reminder_state_on_reschedule',config:['search_path=public, pg_temp']},
  {name:'set_google_calendar_connection_updated_at',config:['search_path=public, pg_temp']},
 ]);
 const business='10000000-0000-4000-8000-000000000101';
 const before=(await db.query("select count(*)::int as n from notifications where business_id=$1 and type='payment_failed'",[business])).rows[0].n;
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 await db.query("update bookings set payment_status='failed' where id='10000000-0000-4000-8000-000000000501'");
 const after=(await db.query("select count(*)::int as n from notifications where business_id=$1 and type='payment_failed'",[business])).rows[0].n;
 same(after,before+1);
 console.log(`Function access: ${checks} assertions passed, including notification trigger delivery to the local feed.`);
}
