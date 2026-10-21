// Offline audit: real handler/helper source, mocked external services. No network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { salonDateWindow, requestDateBounds, firstRequestedSalonDay } from '../src/lib/appointment-waitlist.ts';
import { readJsonWithLimit } from '../src/lib/request-limits.ts';
const results=[];
async function test(name, fn) { try { await fn();results.push({name,pass:true}); } catch(e) {results.push({name,pass:false,error:e.message});} }
let state;
const db={from(table){const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},is(k,v){filters[k]=v;return q},limit(){return Promise.resolve(result())},maybeSingle(){return Promise.resolve(result())},insert(row){state.inserts.push(row);return Promise.resolve({error:state.insertError?{code:'AUDIT'}:null})}};
function result(){state.queries.push({table,filters:{...filters}});if(state.fail===table)return {data:null,error:{message:'private'}};if(state.missing===table)return {data:null};if(table==='businesses')return{data:{id:base.businessId,timezone:'Europe/London'}};if(table==='service_staff')return {data:filters.staff_id?(state.incompatible?null:{staff_id:filters.staff_id}):[{staff_id:base.staffId}]};return {data:{id:'mock'}};}return q;}};
let source=fs.readFileSync(new URL('../src/routes/api/appointment-waitlist.ts',import.meta.url),'utf8');
source=source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm,'').replace('export const Route','const Route');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const handler=new Function('createFileRoute','supabaseAdmin','consumePublicRequest','publicRequestLimitResponse','readJsonWithLimit','salonDateWindow','trustedAppOrigin','requestDateBounds',js+';return Route.server.handlers.POST;')(()=>x=>x,db,async()=>{if(state.rate)throw new Error('limited')},()=>new Response(null,{status:429}),readJsonWithLimit,salonDateWindow,()=> 'https://example.test',requestDateBounds);
const base={businessId:'11111111-1111-4111-8111-111111111111',serviceId:'22222222-2222-4222-8222-222222222222',staffId:'33333333-3333-4333-8333-333333333333',name:'Fictional Test',email:'test@example.invalid',phone:'',from:'2026-10-22',through:'2026-10-23',consent:true,automaticEmailOptIn:false,preferredTime:'any'};
const originalNow=Date.now;Date.now=()=>Date.parse('2026-10-21T12:00:00Z');
const originalFlag=process.env.BETTER_TIME_OFFERS_ENABLED;process.env.BETTER_TIME_OFFERS_ENABLED='false';
async function call(patch={},options={}){state={inserts:[],queries:[],...options};const response=await handler({request:new Request('https://example.test/api/appointment-waitlist',{method:'POST',headers:{origin:options.origin??'https://example.test'},body:options.raw??JSON.stringify({...base,...patch})})});return response;}
await test('valid request inserts only requested fields',async()=>{assert.equal((await call({status:'closed',owner_id:'attacker'})).status,200);assert.equal(state.inserts.length,1);assert.equal(state.inserts[0].status,undefined);assert.equal(state.inserts[0].owner_id,undefined);});
for(const [name,patch] of Object.entries({badBusiness:{businessId:'bad'},badService:{serviceId:'bad'},badStaff:{staffId:'bad'},blankName:{name:' '},longName:{name:'x'.repeat(121)},badEmail:{email:'nope'},longEmail:{email:'x'.repeat(250)+'@test.invalid'},longPhone:{phone:'1'.repeat(51)},badTime:{preferredTime:'night'},noConsent:{consent:false},stringConsent:{consent:'true'},missingOptin:{automaticEmailOptIn:null},badDate:{from:'bad'},impossibleDate:{from:'2026-02-30'},reversedDates:{from:'2026-10-24'},pastDates:{from:'2026-10-01',through:'2026-10-02'},farStart:{from:'2027-01-01',through:'2027-01-02'},tooWide:{through:'2027-01-01'}}))await test(name,async()=>{assert.equal((await call(patch)).status,400);assert.equal(state.inserts.length,0)});
for(const origin of ['https://evil.invalid','null',''])await test('reject origin '+origin,async()=>{assert.equal((await call({}, {origin})).status,403);assert.equal(state.queries.length,0)});
for(const [raw,status] of [['{',400],['null',400],['[]',400],['true',400],['x'.repeat(4097),413],['"'+'€'.repeat(1500)+'"',413]])await test('body '+raw.slice(0,10)+' '+status,async()=>assert.equal((await call({}, {raw})).status,status));
await test('disabled automated opt-in rejected',async()=>assert.equal((await call({automaticEmailOptIn:true})).status,503));
await test('rate limit fail closed',async()=>{assert.equal((await call({}, {rate:true})).status,429);assert.equal(state.queries.length,0)});
for(const [table,status] of [['businesses',404],['services',400],['staff',400],['service_staff',503]])await test('database failure '+table,async()=>{assert.equal((await call({}, {fail:table})).status,status);assert.equal(state.inserts.length,0)});
await test('incompatible service staff rejected',async()=>assert.equal((await call({}, {incompatible:true})).status,400));
await test('insert failure not reported as success',async()=>assert.equal((await call({}, {insertError:true})).status,503));
await test('tenant and active filters applied',async()=>{await call();for(const t of ['services','staff','service_staff'])assert.ok(state.queries.filter(q=>q.table===t).every(q=>q.filters.business_id===base.businessId));assert.equal(state.queries.find(q=>q.table==='staff').filters.bookable,true);});
await test('end date beyond 61-day horizon rejected',async()=>assert.equal((await call({from:'2026-12-20',through:'2027-02-18'})).status,400));
await test('past start date with future end rejected',async()=>assert.equal((await call({from:'2026-10-01',through:'2026-10-23'})).status,400));
await test('non-string customer name rejected',async()=>assert.equal((await call({name:{unexpected:'object'}})).status,400));
let dateCases=0;
await test('every 2026 day roundtrips in four timezones',()=>{for(const zone of ['Europe/London','UTC','America/New_York','Australia/Sydney'])for(let day=0;day<365;day++){const date=new Date(Date.UTC(2026,0,1)+day*86400000).toISOString().slice(0,10);const w=salonDateWindow(date,date,zone);assert.equal(firstRequestedSalonDay(w.after,zone),date);assert.equal(firstRequestedSalonDay(new Date(Date.parse(w.before)-1).toISOString(),zone),date);assert.ok([23,24,25].includes((Date.parse(w.before)-Date.parse(w.after))/3600000));dateCases++;}});
Date.now=originalNow;if(originalFlag===undefined)delete process.env.BETTER_TIME_OFFERS_ENABLED;else process.env.BETTER_TIME_OFFERS_ENABLED=originalFlag;
const report={scope:'Offline actual handler source; external database and limiter mocked; not production permission proof',dateCases,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results};
console.log(JSON.stringify(report,null,2));
if(report.failed)process.exitCode=1;
