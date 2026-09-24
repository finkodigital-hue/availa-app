import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
let rpcCalls=[], lookupFailure=false, missingCharge=false, account='acct_fixture';
globalThis.__refundTestDatabase={
 from(table){ const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){
   if(lookupFailure)return {error:new Error('fictional outage')};
   if(table==='businesses')return {data:filters.stripe_account_id===account?{id:'business_fixture',stripe_account_id:account}:null};
   assert.equal(table,'payments');assert.deepEqual(filters,{business_id:'business_fixture',stripe_payment_intent_id:'pi_fixture',type:'charge',status:'succeeded'});
   return {data:missingCharge?null:{booking_id:'booking_fixture'}};
 }};},
 async rpc(name,args){rpcCalls.push({name,args});return {error:null};}
};
// Load the actual handler, replacing only the router registration and database
// boundary. Other dynamic provider branches are never invoked by these cases.
const source=fs.readFileSync(path.join(root,'src/routes/api.stripe-webhook.ts'),'utf8')
 .replace('import { createFileRoute } from "@tanstack/react-router";','const createFileRoute=()=>value=>value;')
 .replace('import { readBodyWithLimit } from "@/lib/request-limits";',fs.readFileSync(path.join(root,'src/lib/request-limits.ts'),'utf8'))
 .replaceAll('await import("@/integrations/supabase/client.server")','({supabaseAdmin:globalThis.__refundTestDatabase})');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {Route}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
process.env.STRIPE_WEBHOOK_SECRET='fictional_webhook_secret';delete process.env.STRIPE_PLATFORM_WEBHOOK_SECRET;
const event=(type='refund.created',metadata={})=>({type,account,data:{object:{id:'re_fixture',payment_intent:'pi_fixture',amount:1000,currency:'gbp',status:'succeeded',metadata}}});
const send=async(payload,offset=0,signature=true)=>{const body=JSON.stringify(payload),t=Math.floor(Date.now()/1000)+offset;
 const hash=createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
 return Route.server.handlers.POST({request:new Request('https://example.invalid/api/stripe-webhook',{method:'POST',headers:signature?{'stripe-signature':`t=${t},v1=${hash}`}:{},body})});};
let checks=0;const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
same((await send(event())).status,200);same(rpcCalls.length,1);
same(rpcCalls[0],{name:'fulfill_stripe_refund',args:{p_business_id:'business_fixture',p_booking_id:'booking_fixture',p_amount_cents:1000,p_currency:'gbp',p_stripe_refund_id:'re_fixture',p_stripe_payment_intent_id:'pi_fixture',p_initiated_by_user_id:null}});
same((await send(event('refund.updated',{business_id:'business_fixture',booking_id:'booking_fixture'}))).status,200);
same((await send(event('refund.created',{business_id:'other'}))).status,400);
same((await send({...event(),account:'acct_other'})).status,400);
same((await send(event(),0,false)).status,400);
same((await send(event(),-600)).status,400);
const pending=event();pending.data.object.status='pending';same((await send(pending)).status,200);
same((await send(event('refund.created',{resolution:'unfulfilled_booking'}))).status,200);
same(rpcCalls.length,2);
const originalError=console.error;
const expectedErrors=[];
try {
 console.error=(message)=>expectedErrors.push(message);
 missingCharge=true;same((await send(event())).status,500);missingCharge=false;
 lookupFailure=true;same((await send(event())).status,500);
} finally {console.error=originalError;}
same(expectedErrors.length,2);
same(rpcCalls.length,2);
delete globalThis.__refundTestDatabase;
console.log(`Refund webhook: ${checks} assertions passed with fictional signed events; no provider requests.`);
