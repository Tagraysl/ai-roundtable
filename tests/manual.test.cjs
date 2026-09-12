const test=require('node:test'),assert=require('node:assert/strict');
const {ManualAdapter}=require('../src/adapters/manual.cjs');
const {Discussion,newRoom,defaults,validateMember}=require('../src/core.cjs');
test('manual reply resumes discussion with shared context and no browser bridge',async()=>{
  const manual=new ManualAdapter(),room=newRoom();let nextPrompt='';
  const engine=new Discussion({getAdapter:m=>m.kind==='web'?manual:{send:async p=>{nextPrompt=p.prompt;return{text:'reviewed'};}},persist:()=>{},emit:()=>{}});
  const running=engine.run(room,[defaults().members[0],defaults().members[1]]);
  const job=manual.status();assert.ok(job);assert.throws(()=>manual.submit('stale','wrong'));
  assert.throws(()=>manual.submit(job.id,''));manual.submit(job.id,'User pasted Claude answer');
  await running;assert.match(nextPrompt,/User pasted Claude answer/);assert.equal(manual.status(),null);
});
test('manual cancellation clears job and rejects stale submissions',async()=>{
  const manual=new ManualAdapter(),controller=new AbortController();
  const p=manual.send({member:defaults().members[0],prompt:'test',signal:controller.signal});const id=manual.status().id;
  controller.abort();await assert.rejects(p);assert.equal(manual.status(),null);assert.throws(()=>manual.submit(id,'late reply'));
});
test('Claude defaults to manual and cannot be saved as automated website',()=>{
  const m=defaults().members[0];assert.notEqual(m.webMode,'automation');validateMember(m);
  assert.throws(()=>validateMember({...m,webMode:'automation',automationAcknowledged:true}),/Claude/);
  assert.throws(()=>validateMember({...m,url:'https://example.com',webMode:'automation'}),/明确允许/);
});
