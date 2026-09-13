const test = require('node:test');
const assert = require('node:assert/strict');
const {WorkflowRunner, validateGraph} = require('../src/workflow.cjs');
const members = [{id:'provider', kind:'api', model:'same-model'}];
function graph(parallel=false) {
  return {id:'single-model', version:1, name:'Single model', roles:{b:'provider'},
    nodes:[{id:'i',type:'input',title:'Task'},
      {id:'a',type:'ai',title:'Analyze',binding:'provider'},
      {id:'b',type:'ai',title:'Review',binding:'@b'},
      {id:'o',type:'output',title:'Result'}],
    edges:parallel?[['i','a'],['i','b'],['a','o'],['b','o']]:[['i','a'],['a','b'],['b','o']]};
}
const runner = send => new WorkflowRunner({send,confirm:async()=>{},emit:()=>{},persist:()=>{}});
test('one model completes sequential steps with upstream answers', async()=>{
  const g=graph(), seen=[];
  assert.deepEqual(validateGraph(g,members).issues,[]);
  const result=await runner(async p=>{
    seen.push(p);
    return {text:seen.length===1?'analysis-result-token':'review-result-token'};
  }).run(g,members,{task:'Original task'});
  assert.equal(result.status,'complete');
  assert.equal(seen.length,2);
  assert.ok(seen.every(p=>p.member.id==='provider'&&p.member.model==='same-model'));
  assert.ok(seen[1].prompt.includes('analysis-result-token'));
  assert.ok(result.nodes.o.text.includes('review-result-token'));
});
test('independent steps on one model can run concurrently', async()=>{
  let active=0,peak=0;
  const result=await runner(async()=>{
    peak=Math.max(peak,++active);
    await new Promise(resolve=>setTimeout(resolve,25));
    active--; return {text:'Done'};
  }).run(graph(true),members,{task:'Task'});
  assert.equal(result.status,'complete');
  assert.equal(peak,2);
});
test('single-model support retains missing binding and execution capability checks',()=>{
  const missing=graph();missing.nodes[2].binding='missing';
  assert.ok(validateGraph(missing,members).issues.some(i=>i.nodeId==='b'));
  const execution=graph();execution.nodes[2].type='execute';
  assert.ok(validateGraph(execution,members).issues.some(i=>i.nodeId==='b'));
});
