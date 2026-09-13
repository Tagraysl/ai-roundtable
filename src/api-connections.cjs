// Route before a request starts. Never rotate credentials after an API failure.
class ApiConnections{
 constructor({getMembers,getCatalog,send}){Object.assign(this,{getMembers,getCatalog,sendRequest:send});this.busy=new Map();this.waiters=new Set();}
 candidates(member,images){const members=this.getMembers(),catalog=this.getCatalog();return [member.id,...(member.apiPool||[])].filter((id,i,a)=>a.indexOf(id)===i).map(id=>members.find(m=>m.id===id)).filter(m=>{
  if(!m||m.kind!=='api'||m.format!==member.format||m.baseUrl!==member.baseUrl)return false;
  if(images?.length&&m.vision!==true&&require('./model-capabilities.cjs').capability({...m,model:member.model}).status!=='supported')return false;
  return m.id===member.id||catalog.find(c=>c.memberId===m.id)?.models.includes(member.model);
 });}
 async send(params){const {member,signal}=params;let chosen;
  for(;;){signal.throwIfAborted();const candidates=this.candidates(member,params.images);if(!candidates.length)throw Error('No compatible API connection is available.');
   chosen=candidates.filter(m=>(this.busy.get(m.id)||0)<(m.apiConcurrency||3)).sort((a,b)=>(this.busy.get(a.id)||0)-(this.busy.get(b.id)||0))[0];
   if(chosen){this.busy.set(chosen.id,(this.busy.get(chosen.id)||0)+1);break;}
   params.onStatus?.('等待 API 连接的空闲位置…');
   await new Promise((resolve,reject)=>{const cleanup=()=>{this.waiters.delete(wake);signal.removeEventListener('abort',abort);};const wake=()=>{cleanup();resolve();};const abort=()=>{cleanup();reject(signal.reason);};this.waiters.add(wake);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  }
  try{const result=await this.sendRequest({...params,member:{...member,id:chosen.id,baseUrl:chosen.baseUrl,format:chosen.format},onStatus:s=>params.onStatus?.((member.apiPool?.length?chosen.name+' · ':'')+s)});return {...result,connectionId:chosen.id,connectionName:chosen.name};}
  finally{this.busy.set(chosen.id,Math.max(0,(this.busy.get(chosen.id)||1)-1));for(const wake of [...this.waiters])wake();}
 }
}
module.exports={ApiConnections};
