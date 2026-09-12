const test=require('node:test'),assert=require('node:assert/strict');
const {ApiAdapter}=require('../src/adapters/api.cjs');
function streamed(parts){return new Response(new ReadableStream({start(c){for(const part of parts)c.enqueue(new TextEncoder().encode(part));c.close();}}),{headers:{'content-type':'text/event-stream'}});}
const m={id:'api',baseUrl:'https://example.com/v1',model:'test',format:'openai'};
test('OpenAI streaming survives split lines and Chinese UTF-8',async()=>{
  let request;const a=new ApiAdapter({getKey:()=> 'test-key',fetchImpl:async(u,r)=>{request={u,r};return streamed(['data: {"choices":[{"delta":{"content":"你"}}]}\n','data: {"cho','ices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n']);}});
  const r=await a.send({member:m,prompt:'hello',signal:new AbortController().signal});assert.equal(r.text,'你好');assert.equal(request.u,'https://example.com/v1/chat/completions');assert.equal(request.r.redirect,'error');
});
test('truncated stream does not become a successful answer',async()=>{
  const a=new ApiAdapter({getKey:()=> 'x',fetchImpl:async()=>streamed(['data: {"choices":[{"delta":{"content":"partial"}}]}\n'])});
  await assert.rejects(a.send({member:m,prompt:'test',signal:new AbortController().signal}),/提前结束/);
});
test('Anthropic uses distinct headers, body and events',async()=>{
  let request;const a=new ApiAdapter({getKey:()=> 'x',fetchImpl:async(u,r)=>{request={u,r};return streamed(['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"答案"}}\n','data: {"type":"message_stop"}\n']);}});
  const r=await a.send({member:{...m,format:'anthropic'},prompt:'test',signal:new AbortController().signal});assert.equal(r.text,'答案');assert.equal(request.u,'https://example.com/v1/messages');assert.equal(request.r.headers['x-api-key'],'x');assert.ok(JSON.parse(request.r.body).max_tokens);
});
