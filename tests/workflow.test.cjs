const test=require('node:test'),assert=require('node:assert/strict');
const {template,validateGraph,WorkflowRunner}=require('../src/workflow.cjs');
const members=[{id:'a',name:'Alpha',kind:'api'},{id:'b',name:'Beta',kind:'api'},{id:'c',name:'Coder',kind:'codex'}];
function graph(){return {id:'g',version:1,name:'test',roles:{a:'a',b:'b',executor:'c',reviewer:'b'},nodes:[{id:'i',type:'input',title:'input'},{id:'a',type:'ai',title:'A',binding:'@a'},{id:'b',type:'ai',title:'B',binding:'@b'},{id:'m',type:'merge',title:'merge'},{id:'o',type:'output',title:'output'}],edges:[['i','a'],['i','b'],['a','m'],['b','m'],['m','o']]};}
test('templates contain two independent plans, crossed reviews, approval and execution',()=>{
 for(const type of ['duo','pipeline']){const g=template(type);Object.assign(g.roles,{a:'a',b:'b',executor:'c',reviewer:'b'});assert.deepEqual(validateGraph(g,members).issues,[]);assert.ok(g.nodes.some(n=>n.type==='execute'));}
 const g=template('duo');assert.ok(g.edges.some(e=>e[0]==='plan_b'&&e[1]==='review_a'));
});
test('validation allows a single member but rejects missing AI, cycles and non-agent execution',()=>{
 const g=graph();g.roles.b='';assert.ok(validateGraph(g,members).issues.some(x=>x.nodeId==='b'));
 g.roles.b='a';assert.deepEqual(validateGraph(g,members).issues,[]);
 g.edges.push(['m','a']);assert.throws(()=>validateGraph(g,members),/循环/);
 const t=template('duo');Object.assign(t.roles,{a:'a',b:'b',executor:'a',reviewer:'b'});assert.ok(validateGraph(t,members).issues.some(x=>x.nodeId==='execute'));
});
test('branches run concurrently and merge waits for both',async()=>{
 let releaseA,releaseB;const calls=[];const runner=new WorkflowRunner({send:p=>{calls.push(p.member.id);return new Promise(r=>{if(p.member.id==='a')releaseA=()=>r({text:'A result'});else releaseB=()=>r({text:'B result'});});},confirm:async()=>{},persist:()=>{},emit:()=>{}});
 const p=runner.run(graph(),members,{task:'goal'});await new Promise(r=>setImmediate(r));assert.deepEqual(calls.sort(),['a','b']);releaseA();await new Promise(r=>setImmediate(r));assert.equal(runner.active.run.nodes.m.status,'pending');releaseB();const result=await p;assert.equal(result.status,'complete');assert.match(result.nodes.o.text,/A result/);assert.match(result.nodes.o.text,/B result/);
});
test('failure preserves independent sibling and blocks dependent execution',async()=>{
 let executions=0;const runner=new WorkflowRunner({send:async p=>{if(p.member.id==='a')throw Error('failed');await new Promise(r=>setTimeout(r,20));return {text:'independent result'};},confirm:async()=>{executions++;},persist:()=>{},emit:()=>{}});
 const g=graph();g.nodes.find(n=>n.id==='m').type='approval';const r=await runner.run(g,members,{task:'goal'});assert.equal(r.status,'error');assert.equal(executions,0);assert.equal(r.nodes.b.status,'complete');assert.equal(r.nodes.m.status,'cancelled');assert.equal(runner.active,null);
});
test('execution waits for explicit confirmation and passes directory, cancellation invalidates run',async()=>{
 let approve,executed=false;const g=graph();g.nodes.find(n=>n.id==='m').type='execute';g.nodes.find(n=>n.id==='m').binding='@executor';
 const runner=new WorkflowRunner({send:async p=>{if(p.execute){executed=true;assert.equal(p.workspace,'C:/work');}return{text:'answer'};},confirm:()=>new Promise(r=>approve=r),persist:()=>{},emit:()=>{}});
 const p=runner.run(g,members,{task:'goal',workspace:'C:/work'});await new Promise(r=>setImmediate(r));assert.equal(executed,false);approve();assert.equal((await p).status,'complete');assert.equal(executed,true);
});
test('rerun reuses only unaffected completed nodes and invalid resume does not lock runner',async()=>{
 const calls=[];const runner=new WorkflowRunner({send:async p=>{calls.push(p.member.id);return{text:p.member.id};},confirm:async()=>{},persist:()=>{},emit:()=>{}});
 const first=await runner.run(graph(),members,{task:'goal'});calls.length=0;const next=await runner.run(graph(),members,{task:'goal',previous:first,from:'a'});assert.deepEqual(calls,['a']);assert.equal(next.nodes.b.reused,true);
 await assert.rejects(runner.run(graph(),members,{task:'changed',previous:first,from:'a'}));assert.equal(runner.active,null);
});


