import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const tables = {staff:[{id:'staff',name:'Sam'}], services:[{id:'service',name:'Cut'}], customers:[], bookings:[], import_batches:[]};
let failSecondChunk = true;
let chunk = 0;
const supabase = {from(table) {
  let operation='read', payload, range, head=false;
  const filters=[];
  const q = {
    select(_columns,opts) { head=opts?.head ?? false;return q; },
    insert(value) { operation='insert';payload=value;return q; },
    update(value) { operation='update';payload=value;return q; },
    eq(key,value) { filters.push(row=>row[key]===value || (key==='business_id' && row[key]===undefined));return q; },
    not(key) { filters.push(row=>row[key]!=null);return q; },
    order() {return q;},
    range(from,to) {range=[from,to];return q;},
    single() {return q.then(result=>({...result,data:result.data?.[0]}));},
    then(resolve,reject) {
      try {
        if(operation==='insert') {
          if(table==='bookings' && ++chunk===2 && failSecondChunk) return Promise.resolve({error:{message:'Simulated failed request'}}).then(resolve,reject);
          const rows=(Array.isArray(payload)?payload:[payload]).map(row=>({...row,id:row.id ?? `${table}-${tables[table].length}`}));
          tables[table].push(...rows);return Promise.resolve({data:rows,error:null}).then(resolve,reject);
        }
        let rows=tables[table].filter(row=>filters.every(f=>f(row)));
        if(operation==='update') rows.forEach(row=>Object.assign(row,payload));
        const count=rows.length;
        if(range) rows=rows.slice(range[0],range[1]+1);
        return Promise.resolve({data:head?null:rows,count,error:null}).then(resolve,reject);
      } catch(error) {return Promise.reject(error).then(resolve,reject);}
    },
  };
  return q;
}};
const modules = new Map();
function load(file) {
  file=path.resolve(file);
  if(modules.has(file))return modules.get(file);
  const exports={}; modules.set(file,exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,console,Date,Map,Set,crypto,
    require(specifier) {
      if(specifier==='@/integrations/supabase/client')return {supabase};
      return load(path.resolve(path.dirname(file),specifier+'.ts'));
    },
  });
  return exports;
}
const {commitAppointments}=load('src/lib/import/commit.ts');
const rows=Array.from({length:501},(_,i)=>({externalId:'appt-'+i,clientName:'Client '+i,staffName:'Sam',serviceName:'Cut',startsAt:new Date('2030-01-07T10:00:00Z'),endsAt:new Date('2030-01-07T11:00:00Z'),status:'confirmed',priceCents:2000,createdAt:null}));
const params={businessId:'business',sessionId:'session',filename:'fixture.csv',fileHash:'fixture-hash',totalRows:501,skippedInvalid:0,rows,createdBy:'owner'};
await assert.rejects(commitAppointments(params),error=>error.message==='Simulated failed request');
assert.equal(tables.bookings.length,500);
assert.equal(tables.import_batches[0].status,'failed');
assert.equal(tables.import_batches[0].imported_count,500);
failSecondChunk=false;
let result=await commitAppointments(params);
assert.equal(result.imported,1);assert.equal(result.duplicate,500);
assert.equal(tables.bookings.length,501);
assert.equal(tables.import_batches[1].status,'completed');
result=await commitAppointments(params);
assert.equal(result.imported,0);assert.equal(result.duplicate,501);
assert.equal(tables.bookings.length,501);
console.log('Import recovery passed: failed second chunk records 500 saved rows; retry adds only the missing row; repeat creates no duplicates.');
