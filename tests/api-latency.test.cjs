const test=require('node:test'),assert=require('node:assert/strict');
const {ApiAdapter}=require('../src/adapters/api.cjs');
const member={id:'fixture',baseUrl:'https://example.org/v1',model:'fixture',format:'openai'};
const signal=()=>new AbortController().signal;
const sse=controller=>new Response(new ReadableStream({start:controller}),{headers:{'content-type':'text/event-stream'}});
const frame=data=>new TextEncoder().encode('data: '+(typeof data==='string'?data:JSON.stringify(data))+'\n\n');
test('network mode emits first text before completion and stops at DONE without waiting for socket close',async()=>{
 let stream,first,request,cancelled=false;const received=new Promise(r=>first=r);
 const response=new Response(new ReadableStream({start(c){stream=c;},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}});
 const api=new ApiAdapter({getKey:()=> 'fixture',network:{definitions:()=>[]},isNetworkEnabled:()=>true,fetchImpl:async(u,r)=>{request=JSON.parse(r.body);return response;}});
 let settled=false;const pending=api.send({member,prompt:'test',signal:signal(),onText:first}).then(r=>{settled=true;return r;});
 stream.enqueue(frame({choices:[{delta:{content:'First'}}]}));assert.equal(await received,'First');assert.equal(settled,false);assert.equal(request.stream,true);
 stream.enqueue(frame({choices:[{delta:{content:' answer'},finish_reason:'stop'}]}));stream.enqueue(frame('[DONE]'));
 assert.equal((await pending).text,'First answer');assert.equal(cancelled,true);
});
test('fragmented tool calls execute concurrently, maintain result order and preserve reasoning',async()=>{
 let requests=0,release,started=[],second;const gate=new Promise(r=>release=r);
 const network={definitions:()=>[{type:'function',function:{name:'web_search'}}],run:async(name,args)=>{started.push(args.query);if(started.length===2)release();await gate;return {url:'https://example.org/'+args.query};}};
 const api=new ApiAdapter({getKey:()=> 'fixture',network,isNetworkEnabled:()=>true,fetchImpl:async(u,r)=>{requests++;if(requests===1)return sse(c=>{for(const data of [
 {choices:[{delta:{reasoning_content:'reason',tool_calls:[{index:0,id:'a',function:{name:'web_search',arguments:'{"query":'}},{index:1,id:'b',function:{name:'web_search',arguments:'{"query":'}}]}}]},
 {choices:[{delta:{tool_calls:[{index:1,function:{arguments:'"two"}'}},{index:0,function:{arguments:'"one"}'}}]},finish_reason:'tool_calls'}]},'[DONE]'])c.enqueue(frame(data));});second=JSON.parse(r.body);return sse(c=>{c.enqueue(frame({choices:[{delta:{content:'Result'},finish_reason:'stop'}]}));c.enqueue(frame('[DONE]'));});}});
 const result=await api.send({member,prompt:'test',signal:AbortSignal.timeout(2000)});assert.deepEqual(started,['one','two']);assert.deepEqual(second.messages.slice(-2).map(m=>m.tool_call_id),['a','b']);assert.equal(second.messages.at(-3).reasoning_content,'reason');assert.match(result.text,/https:\/\/example.org\/one/);assert.equal(requests,2);
});
test('partial streamed network answer is retained and not retried',async()=>{
 let requests=0,last='';const api=new ApiAdapter({getKey:()=> 'fixture',network:{definitions:()=>[]},isNetworkEnabled:()=>true,fetchImpl:async()=>{requests++;return sse(c=>{c.enqueue(frame({choices:[{delta:{content:'Partial'}}]}));c.close();});}});
 await assert.rejects(api.send({member,prompt:'test',signal:signal(),onText:t=>last=t}),/提前结束/);assert.equal(requests,1);assert.equal(last,'Partial');
});
test('ordinary stream finishes on DONE even if transport stays open',async()=>{
 let cancelled=false;const api=new ApiAdapter({getKey:()=> 'fixture',fetchImpl:async()=>new Response(new ReadableStream({start(c){c.enqueue(frame({choices:[{delta:{content:'Done'}}]}));c.enqueue(frame('[DONE]'));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}})});
 assert.equal((await api.send({member,prompt:'test',signal:signal()})).text,'Done');assert.equal(cancelled,true);
});
