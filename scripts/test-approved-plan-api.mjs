// Execute real handlers with mocked database/provider dependencies. No network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

let plan = 'free';
let reads = [];
let writes = [];
let reviews = [];
const businessId = '91000000-0000-4000-8000-000000000003';
const database = {
  from(table) {
    reads.push(table);
    const result = () => ({data: table === 'businesses' || table === 'public_businesses'
      ? {id:businessId,plan,currency:'GBP'}
      : table === 'customer_reviews' ? reviews : [],error:null});
    const chain = {select(){return chain},eq(){return chain},gte(){return chain},lte(){return chain},neq(){return chain},not(){return chain},order(){return chain},
      maybeSingle(){return Promise.resolve(result())},limit(){return Promise.resolve(result())},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
    return chain;
  },
  async rpc(name) { writes.push(name); return {data:{ok:true},error:null}; },
};
const createServerFn = () => { const builder={middleware(){return builder},validator(){return builder},handler(fn){return fn}};return builder; };
const deps = {
  supabaseAdmin:database,createServerFn,requireSupabaseAuth:{},
  requireWorkspacePermission:async()=>businessId,
  createFileRoute:()=>config=>config,
  consumePublicRequest:async()=> 'fixture',publicRequestLimitResponse:e=>{throw e},
  readJsonWithLimit:async request=>({value:await request.json()}),
  peekBookingActionToken:async()=>({ok:true,bookingId:businessId}),sha256Hex:async()=> 'a'.repeat(64),
};
function load(file, names) {
  let source=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
  source=source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm,'')
    .replace(/await import\("[^"]+"\)/g,'dependencies')
    .replace(/export /g,'');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return new Function('dependencies',...Object.keys(deps),`${js};return {${names.join(',')}};`)(deps,...Object.values(deps));
}
const {assertStudio}=load('src/lib/plan.server.ts',['assertStudio']);
deps.assertStudio=assertStudio;
const reports=load('src/lib/reports.ts',['getBookingsInRange']);
const gifts=load('src/lib/gift-card.functions.ts',['issueGiftCard','redeemGiftCard','startGiftCardCheckout']);
const branding=load('src/lib/business-settings.functions.ts',['saveWhiteLabel']);
const context={supabase:database,userId:businessId};
const previousSales=process.env.ENABLE_PUBLIC_GIFT_CARD_SALES;
process.env.ENABLE_PUBLIC_GIFT_CARD_SALES='true';
try {
  for (const call of [
    ()=>reports.getBookingsInRange({data:{start:'2026-10-01',end:'2026-10-31'},context}),
    ()=>gifts.issueGiftCard({data:{},context}),
    ()=>gifts.redeemGiftCard({data:{},context}),
    ()=>gifts.startGiftCardCheckout({data:{businessId},context}),
    ()=>branding.saveWhiteLabel({data:{},context}),
  ]) {
    reads=[];writes=[];
    await assert.rejects(call(),/Studio plan/);
    assert.deepEqual(writes,[],'Free cannot reach gift/branding mutations');
    assert.ok(!reads.includes('bookings'),'Free cannot read analytics');
  }
  plan='studio';reads=[];
  assert.deepEqual(await reports.getBookingsInRange({data:{start:'2026-10-01',end:'2026-10-31'},context}),[]);
  assert.ok(reads.includes('bookings'),'Studio can read analytics');
  // Reviews are readable on Free, while publication consent/status filtering remains.
  plan='free';reviews=[{id:'review',rating:5,body:'Great visit',reviewer_name:'Fictional Customer',source:'bookzenvo',verified:true}];
  const publicReviews=load('src/routes/api/public-reviews.ts',['Route']).Route.server.handlers.GET;
  const response=await publicReviews({request:new Request(`https://example.invalid/api/public-reviews?business_id=${businessId}`)});
  assert.equal(response.status,200);
  assert.equal((await response.json()).reviews[0].reviewerName,'Fictional C.');
  const submit=load('src/routes/api/reviews/submit.ts',['Route']).Route.server.handlers.POST;
  writes=[];
  const submitted=await submit({request:new Request('https://example.invalid/api/reviews/submit',{method:'POST',body:JSON.stringify({token:'valid-fixture-token',rating:5,body:'Great visit',agreedToPublish:true})})});
  assert.equal(submitted.status,200);
  assert.deepEqual(writes,['submit_customer_review']);
  const unconsented=await submit({request:new Request('https://example.invalid/api/reviews/submit',{method:'POST',body:JSON.stringify({token:'valid-fixture-token',rating:5,body:'Great visit',agreedToPublish:false})})});
  assert.equal(unconsented.status,400);
  console.log('Approved plan API checks passed: Free blocked from reports, gift operations and branding; Studio analytics allowed; Free reviews allowed with consent enforcement.');
} finally {
  if(previousSales===undefined)delete process.env.ENABLE_PUBLIC_GIFT_CARD_SALES;
  else process.env.ENABLE_PUBLIC_GIFT_CARD_SALES=previousSales;
}
