const test=require('node:test'),assert=require('node:assert/strict');
const {Discussion,newRoom,buildPrompt,validateMember}=require('../src/core.cjs');
const member=id=>({id,name:id,kind:'api',baseUrl:'https://example.com/v1',model:'test',format:'openai'});
test('later participants receive prior responses and subsequent rounds',async()=>{
  const room=newRoom();room.messages.push({role:'user',text:'original question',status:'complete'});const calls=[];
  const engine=new Discussion({getAdapter:m=>({send:async p=>{calls.push({id:m.id,prompt:p.prompt});return {text:`${m.id} answer ${calls.length}`};}}),persist:()=>{},emit:()=>{}});
  await engine.run(room,[member('a'),member('b')],{rounds:2});
  assert.equal(calls.length,4);assert.match(calls[1].prompt,/a answer 1/);assert.match(calls[2].prompt,/b answer 2/);assert.equal(engine.active,null);
});
test('failed participant stops downstream calls and preserves partial text',async()=>{
  const r=newRoom();let calls=0;const engine=new Discussion({getAdapter:()=>({send:async p=>{calls++;p.onText('partial');throw Error('broken');}}),persist:()=>{},emit:()=>{}});
  await assert.rejects(engine.run(r,[member('a'),member('b')]),/broken/);assert.equal(calls,1);assert.equal(r.messages[0].text,'partial');assert.equal(r.messages[0].status,'error');
  assert.ok(!buildPrompt(r,member('b'),'discussion',1).text.includes('partial'));
});
test('stop prevents a second response and marks cancellation',async()=>{
  const r=newRoom();const engine=new Discussion({getAdapter:()=>({send:async p=>{engine.stop();return{text:'late'};}}),persist:()=>{},emit:()=>{}});
  await assert.rejects(engine.run(r,[member('a'),member('b')]));assert.equal(r.messages.length,1);assert.equal(r.messages[0].status,'cancelled');
});
test('context truncation is explicit and keeps recent complete messages',()=>{
  const r=newRoom();r.messages=Array.from({length:20},(_,i)=>({role:i?'assistant':'user',name:'A',text:`message ${i} `+'x'.repeat(300),status:'complete'}));
  const p=buildPrompt(r,member('b'),'discussion',2,4000);assert.ok(p.omitted>0);assert.match(p.text,/message 19/);assert.match(p.text,/上下文提示/);
});
test('validation blocks credentials in URLs and shell scripts',()=>{
  assert.throws(()=>validateMember({...member('a'),baseUrl:'https://user:secret@example.com'}));
  assert.throws(()=>validateMember({...member('a'),baseUrl:'http://example.com'}));
  assert.throws(()=>validateMember({id:'a',name:'a',kind:'terminal',executable:'C:/bad.cmd',args:[]}));
});
