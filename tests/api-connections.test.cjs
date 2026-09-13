const test=require('node:test'),assert=require('node:assert/strict');const {ApiConnections}=require('../src/api-connections.cjs');
const a={id:'a',name:'A',kind:'api',baseUrl:'https://example.org/v1',format:'openai',model:'m',apiConcurrency:1,apiPool:['b']};const b={...a,id:'b',name:'B',apiPool:[]};const tick=()=>new Promise(r=>setImmediate(r));
test('explicit pool balances independent requests and queues without exceeding connection concurrency',async()=>{
 const seen=[],release=[];const pool=new ApiConnections({getMembers:()=>[a,b],getCatalog:()=>[{memberId:'b',models:['m']}],send:p=>{seen.push(p.member.id);return new Promise(r=>release.push(()=>r({text:'ok'})));}});const p={member:a,prompt:'task',signal:new AbortController().signal};
 const first=pool.send(p),second=pool.send(p),third=pool.send(p);await tick();assert.deepEqual(seen,['a','b']);release[0]();await tick();assert.deepEqual(seen,['a','b','a']);release[1]();release[2]();const results=await Promise.all([first,second,third]);assert.deepEqual(results.map(r=>r.connectionId),['a','b','a']);assert.equal(pool.busy.get('a'),0);
});
test('pool refuses mismatched models, endpoints and image capabilities',async()=>{
 const others=[{...b,baseUrl:'https://other.org/v1'},{...b,vision:false}];for(const candidate of others){const pool=new ApiConnections({getMembers:()=>[{...a,vision:true},candidate],getCatalog:()=>[{memberId:'b',models:['m']}],send:async p=>({text:p.member.id})});const result=await pool.send({member:{...a,vision:true},images:[{path:'fixture'}],signal:new AbortController().signal});assert.equal(result.text,'a');}
 const pool=new ApiConnections({getMembers:()=>[a,b],getCatalog:()=>[{memberId:'b',models:['different']}],send:async p=>({text:p.member.id})});assert.deepEqual(pool.candidates(a,[]).map(m=>m.id),['a']);
});
test('failed request is not rotated to another key; cancelled waiter never dispatches',async()=>{
 let count=0;const pool=new ApiConnections({getMembers:()=>[a,b],getCatalog:()=>[{memberId:'b',models:['m']}],send:async()=>{count++;throw Object.assign(Error('rate limited'),{status:429});}});await assert.rejects(pool.send({member:a,signal:new AbortController().signal}),/rate limited/);assert.equal(count,1);
 let release;const single=new ApiConnections({getMembers:()=>[a],getCatalog:()=>[],send:()=>{count++;return new Promise(r=>release=()=>r({text:'ok'}));}});const first=single.send({member:a,signal:new AbortController().signal}),controller=new AbortController();const queued=single.send({member:a,signal:controller.signal});controller.abort();await assert.rejects(queued);release();await first;assert.equal(count,2);assert.equal(single.waiters.size,0);
});
