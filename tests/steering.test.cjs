const test=require('node:test'),assert=require('node:assert/strict');
const {Discussion,newRoom}=require('../src/core.cjs');const {WorkflowRunner,template}=require('../src/workflow.cjs');
const members=[{id:'a',name:'A',kind:'api'},{id:'b',name:'B',kind:'api'},{id:'c',name:'C',kind:'codex'}];
test('skip cancels stalled member and continues to next without partial context',async()=>{const room=newRoom();let calls=0;const engine=new Discussion({persist:()=>{},emit:()=>{},getAdapter:()=>({send:p=>{calls++;if(calls===1){p.onText('discard me');return new Promise((r,j)=>p.signal.addEventListener('abort',()=>j(Error('cancelled'))));}assert.ok(!p.prompt.includes('discard me'));return Promise.resolve({text:'next member works'});}})});const running=engine.run(room,members.slice(0,2));engine.skip();await running;assert.equal(calls,2);assert.equal(room.messages[0].status,'cancelled');assert.equal(room.messages[1].status,'complete');});
test('API steering restarts only current reply and excludes cancelled partial answer',async()=>{
 const room=newRoom(),calls=[];let ready;const started=new Promise(r=>ready=r);
 const engine=new Discussion({persist:()=>{},emit:()=>{},getAdapter:()=>({send:p=>{calls.push(p);if(calls.length===1){p.onText('obsolete partial');ready();return new Promise((res,rej)=>p.signal.addEventListener('abort',()=>rej(Error('aborted')),{once:true}));}return Promise.resolve({text:'new answer'});}})});
 const running=engine.run(room,members.slice(0,2));await started;engine.steer('新增限制：预算100元',true);await running;
 assert.equal(calls.length,3);assert.match(calls[1].prompt,/预算100元/);assert.match(calls[2].prompt,/预算100元/);assert.ok(!calls[2].prompt.includes('obsolete partial'));assert.equal(room.messages[0].status,'cancelled');assert.equal(room.messages.filter(x=>x.steering).length,1);
});
test('queued steering leaves current request unchanged and reaches next participant',async()=>{
 let release;const calls=[],room=newRoom();const engine=new Discussion({persist:()=>{},emit:()=>{},getAdapter:()=>({send:p=>{calls.push(p.prompt);return calls.length===1?new Promise(r=>release=()=>r({text:'first'})):Promise.resolve({text:'second'});}})});
 const running=engine.run(room,members.slice(0,2));engine.steer('补充证据来源');release();await running;assert.ok(!calls[0].includes('补充证据来源'));assert.match(calls[1],/补充证据来源/);
});
test('workflow supplement is persisted, reaches pending nodes and execution approval, disallows stale partial rerun',async()=>{
 const graph=template('pipeline');Object.assign(graph.roles,{a:'a',b:'b',executor:'c',reviewer:'b'});let release;const calls=[],gates=[];const runner=new WorkflowRunner({persist:()=>{},emit:()=>{},confirm:async p=>gates.push(p.prompt),send:p=>{calls.push(p);return calls.length===1?new Promise(r=>release=()=>r({text:'plan'})):Promise.resolve({text:'result'});}});
 const running=runner.run(graph,members,{task:'task',workspace:process.cwd()});await new Promise(r=>setImmediate(r));runner.steer('必须保留原文件');release();const run=await running;assert.equal(run.status,'complete');assert.ok(!calls[0].prompt.includes('必须保留原文件'));assert.ok(calls.slice(1).every(p=>p.prompt.includes('必须保留原文件')));assert.ok(gates.some(p=>p.includes('必须保留原文件')));assert.equal(run.supplements.length,1);await assert.rejects(()=>runner.run(graph,members,{task:'task',workspace:process.cwd(),previous:run,from:'review'}),/完整重跑/);
});
