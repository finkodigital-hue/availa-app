import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

// Run the real handlers against fictional tenants and a simulated Worker
// subrequest ceiling. An arbitrary number of suppressed tenants must not
// prevent active tenants or the completion heartbeat from being processed.
let requests = 0;
let completed = false;
const businesses = [
  ...Array.from({length:100},(_,i)=>({id:`suppressed-${i}`,email_suppressed:true,sms_suppressed:true})),
  {id:'unknown',email_suppressed:null,sms_suppressed:null},
  {id:'email-only',email_suppressed:false,sms_suppressed:true},
  {id:'sms-only',email_suppressed:true,sms_suppressed:false},
];
const visited = new Set();
const database = {
  async rpc() { requests++; return {data:null,error:null}; },
  from(table) {
    const filters = []; let either = false; let values; let selection = '';
    const q = {
      select(v) { selection=v; return q; },
      eq(k,v) { filters.push([k,v]); return q; },
      or(v) { if(v==='email_suppressed.eq.false,sms_suppressed.eq.false') either=true; return q; },
      is(){return q;},not(){return q;},gt(){return q;},gte(){return q;},lt(){return q;},lte(){return q;},
      neq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},
      upsert(v){values=v; return q;},update(v){values=v; return q;},
      then(resolve,reject) {
        try {
          assert.ok(++requests < 50,'Suppressed tenants exhausted the Worker request budget');
          if(values?.last_success_at) completed=true;
          let data=[];
          if(table==='businesses') {
            data=businesses.filter(b=>(!either || b.email_suppressed===false || b.sms_suppressed===false)
              && filters.every(([k,v])=>!['email_suppressed','sms_suppressed'].includes(k)||b[k]===v));
          }
          if(table==='bookings') {
            for(const [k,v] of filters) if(k==='business_id') visited.add(v);
            if(selection.includes('confirmation_sent_at') || selection.includes('created_at')) {
              assert.ok(selection.includes('businesses!inner('),'Confirmation suppression must filter parent bookings');
              assert.ok(filters.some(([k,v])=>k==='businesses.email_suppressed'&&v===false));
            }
          }
          if(table==='notification_preferences') data={customer_booking_reminder_sms:false,customer_aftercare_email:false,customer_rebooking_email:false};
          resolve({data,error:null});
        } catch(e) { reject(e); }
      },
    };
    return q;
  },
};
const noSend = () => {throw Error('Unexpected provider call');};
const modules = {
  '@tanstack/react-router':{createFileRoute:()=>x=>x},
  '@/integrations/supabase/client.server':{supabaseAdmin:database},
  '@/lib/internal-auth.server':{hasExpectedBearer:()=>true},
  '@/lib/resend.server':{sendEmail:noSend,EmailSendError:Error},
  '@/lib/sms.server':{sendSms:noSend,SmsSendError:Error},
  '@/lib/payment-reconciliation.server':{reconcileFailedBookingPayments:async()=>({checked:0})},
  '@/lib/booking-change-email.server':{processBookingChangeEmails:async()=>({sent:0})},
  '@/lib/better-time-offers.server':{processBetterTimeOffers:async()=>({sent:0})},
};
function load(path) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code,{exports,require:name=>modules[name]??{},Response,Date,console,
    process:{env:{CRON_REMINDER_SECRET:'fictional'}},fetch:noSend});
  return exports;
}
modules['@/lib/retention-sweep.server']=load('../src/lib/retention-sweep.server.ts');
const route=load('../src/routes/api/cron/send-reminders.ts');
const response=await route.Route.server.handlers.POST({request:{}});
assert.equal(response.status,200);
assert.ok(completed);
assert.deepEqual([...visited].sort(),['email-only','sms-only']);
assert.ok(requests<20);
console.log(`Reminder sweep completed in ${requests} mock requests with 100 suppressed tenants; email-only/SMS-only tenants retained, null flags excluded, zero sends.`);
