const {readSSE}=require('./sse.cjs');
// Assemble tool-call fragments without waiting for the HTTP socket to close.
async function readChatCompletion(response,{onText=()=>{},onStatus=()=>{}}={}){
 if(!response.headers.get('content-type')?.includes('text/event-stream')){
  const data=await response.json(),choice=data.choices?.[0];
  if(data.error||!choice?.message)throw Error('联网模式 API 响应格式不兼容。');
  if(choice.finish_reason==='length')throw Error('回复达到输出长度限制。');
  if(choice.message.content)onText(choice.message.content);
  return {message:choice.message,usage:data.usage};
 }
 const message={role:'assistant',content:''},calls=new Map();let complete=false,usage;
 await readSSE(response,raw=>{
  if(!raw)return;
  if(raw==='[DONE]'){complete=true;return false;}
  let data;try{data=JSON.parse(raw);}catch{throw Error('API 流式响应包含无效数据。');}
  if(data.error)throw Error('API 在生成过程中返回错误。');
  if(data.usage)usage=data.usage;
  const choice=data.choices?.[0],delta=choice?.delta;
  if(typeof delta?.content==='string'&&delta.content){if(!message.content)onStatus('正在接收回答…');message.content+=delta.content;onText(message.content);}
  if(typeof delta?.reasoning_content==='string')message.reasoning_content=(message.reasoning_content||'')+delta.reasoning_content;
  for(const part of delta?.tool_calls||[]){
   if(!Number.isInteger(part.index)||part.index<0||part.index>3)throw Error('已达到本次联网调用上限，请缩小问题范围。');
   const call=calls.get(part.index)||{id:'',type:'function',function:{name:'',arguments:''}};
   if(part.id)call.id+=part.id;
   if(part.function?.name)call.function.name+=part.function.name;
   if(part.function?.arguments)call.function.arguments+=part.function.arguments;
   calls.set(part.index,call);
  }
  if(choice?.finish_reason==='length')throw Error('回复达到输出长度限制。');
  if(choice?.finish_reason)complete=true;
 });
 if(!complete)throw Error('API 连接提前结束；已收到的文本保留为未完成回复。');
 if(calls.size){message.tool_calls=[...calls].sort((a,b)=>a[0]-b[0]).map(([,c])=>c);if(message.tool_calls.some(c=>!c.id||!c.function.name))throw Error('API 工具调用不完整。');}
 return {message,usage};
}
module.exports={readChatCompletion};
