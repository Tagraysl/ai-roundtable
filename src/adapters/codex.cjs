const {spawn}=require('node:child_process');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
function discoverCodex() {
  for(const dir of (process.env.PATH||'').split(path.delimiter)) {
    const f=path.join(dir,process.platform==='win32'?'codex.exe':'codex'); if(fs.existsSync(f)) return f;
  }
  if(process.platform!=='win32'){for(const dir of ['/opt/homebrew/bin','/usr/local/bin']){const f=path.join(dir,'codex');if(fs.existsSync(f))return f;}return 'codex';}
  const base=path.join(process.env.LOCALAPPDATA||'','OpenAI','Codex','bin');
  try {
    const candidates=fs.readdirSync(base).map(p=>path.join(base,p,'codex.exe')).filter(p=>fs.existsSync(p));
    candidates.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
    if(candidates.length)return candidates[0];
  }catch{}
  return process.platform==='win32'?'codex.exe':'codex';
}
class Rpc extends EventEmitter {
  constructor(executable,cwd) {
    super();this.seq=0;this.pending=new Map();this.closed=false;
    const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    if(process.platform==='darwin')env.PATH=[env.PATH||'','/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin'].join(path.delimiter);
    this.child=spawn(executable||discoverCodex(),['app-server','--stdio'],{cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    let buf=''; this.child.stderr.resume(); this.child.stdin.on('error',()=>{});
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data',chunk=>{
      buf+=chunk; let i;
      while((i=buf.indexOf('\n'))>=0) {
        const line=buf.slice(0,i);buf=buf.slice(i+1);let msg;try{msg=JSON.parse(line);}catch{continue;}
        if(msg.id!==undefined && !msg.method) {const p=this.pending.get(msg.id);if(p){this.pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(msg.error.message||'Codex 协议错误')):p.resolve(msg.result);}}
        else if(msg.method && msg.id!==undefined) {
          // This release is a discussion client. Never grant tool, shell or file permissions.
          if(msg.method.includes('requestApproval')) this.write({id:msg.id,result:{decision:'decline'}});
          else this.write({id:msg.id,error:{code:-32601,message:'Discussion client does not implement this tool request'}});
        } else this.emit('notice',msg);
      }
    });
    this.child.on('error',()=>this.fail(Error('无法启动 Codex，请在设置中选择 Codex 可执行程序。')));
    this.child.on('close',()=>this.fail(Error('Codex 进程已结束。')));
  }
  write(msg){if(!this.closed)this.child.stdin.write(JSON.stringify(msg)+'\n');}
  request(method,params={},timeout=30000) {
    if(this.closed)return Promise.reject(Error('Codex 连接已关闭。'));
    return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Codex ${method} 超时。`));},timeout);this.pending.set(id,{resolve,reject,timer});this.write({id,method,params});});
  }
  async initialize(){await this.request('initialize',{clientInfo:{name:'ai_roundtable',title:'AI Roundtable',version:'0.1.0'}});this.write({method:'initialized',params:{}});}
  fail(e){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();this.emit('disconnected',e);}
  close(){this.child.kill();this.fail(Error('Codex 连接已关闭。'));}
}
class CodexAdapter {
  constructor({cwd,timeout=600000}){this.cwd=cwd;this.timeout=timeout;}
  async probe(member){const rpc=new Rpc(member.executable,this.cwd);try{await rpc.initialize();const r=await rpc.request('account/read');return {connected:true,authenticated:!!r.account,accountType:r.account?.type||null};}finally{rpc.close();}}
  async login(member,openURL) {
    const rpc=new Rpc(member.executable,this.cwd);
    try {
      await rpc.initialize();
      const complete=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Codex 登录超时，请重试。')),180000);
        rpc.on('notice',msg=>{if(msg.method==='account/login/completed'){clearTimeout(timer);msg.params.success?resolve(true):reject(Error('Codex 登录未完成。'));}});
        rpc.once('disconnected',e=>{clearTimeout(timer);reject(e);});
      });
      complete.catch(()=>{});
      const info=await rpc.request('account/login/start',{type:'chatgpt'});
      if(!info.authUrl)throw Error('Codex 未返回登录地址。');
      await openURL(info.authUrl);await complete;return true;
    }finally{rpc.close();}
  }
  async send({member,prompt,signal,onText=()=>{},onStatus=()=>{},execute=false,workspace='',images=[]}) {
    signal.throwIfAborted();
    const cwd=workspace||this.cwd;
    if(execute&&(!path.isAbsolute(cwd)||!fs.statSync(cwd).isDirectory()))throw Error('无效执行目录。');
    const rpc=new Rpc(member.executable,cwd);
    const cancelConnection=()=>rpc.close();signal.addEventListener('abort',cancelConnection,{once:true});
    let threadId,turnId,abort;
    try {
      onStatus('正在连接本机 Codex…');await rpc.initialize();
      signal.throwIfAborted();
      onStatus('正在检查 Codex 登录…');const account=await rpc.request('account/read');if(!account.account)throw Error('Codex 尚未登录，请在成员设置中检查连接并登录。');
      const p={cwd,approvalPolicy:'never',sandbox:execute?'workspace-write':'read-only',ephemeral:true};
      if(member.model?.trim())p.model=member.model.trim();
      onStatus('正在创建 Codex 会话…');const started=await rpc.request('thread/start',p,60000);threadId=started.thread.id;
      return await new Promise((resolve,reject)=>{
        let done=false;const texts=new Map();let last='',final='';
        const finish=(e,result)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);e?reject(e):resolve(result);};
        abort=()=>{if(turnId)rpc.request('turn/interrupt',{threadId,turnId},3000).catch(()=>{});finish(Error('已停止 Codex 请求。'));};
        const timer=setTimeout(()=>finish(Error('Codex 回复超时。')),this.timeout);
        signal.addEventListener('abort',abort,{once:true});
        rpc.once('disconnected',e=>finish(e));
        rpc.on('notice',msg=>{
          const q=msg.params||{};if(q.threadId!==threadId)return;
          if(msg.method==='turn/started'){turnId=q.turn?.id;onStatus('Codex 已接收任务，等待生成…');}
          if(msg.method==='item/started'){const labels={reasoning:'Codex 正在思考…',webSearch:'Codex 正在搜索网络…',commandExecution:'Codex 正在运行工具…',mcpToolCall:'Codex 正在调用外部工具…',agentMessage:'Codex 正在生成回复…'};onStatus(labels[q.item?.type]||'Codex 正在处理任务…');}
          if(msg.method==='error'){onStatus('Codex 服务报告异常'+(q.willRetry?'，正在重试…':'…'));if(q.willRetry!==true)finish(Error(q.error?.message||'Codex 服务异常，请检查连接。'));}
          if(msg.method==='item/agentMessage/delta'){const s=(texts.get(q.itemId)||'')+(q.delta||'');texts.set(q.itemId,s);last=s;onText(s);}
          if(msg.method==='item/completed' && q.item?.type==='agentMessage'){last=q.item.text||last;if(q.item.phase==='final_answer')final=last;onText(last);}
          if(msg.method==='turn/completed') {
            if(q.turn?.status!=='completed')finish(Error(q.turn?.error?.message||`Codex 状态：${q.turn?.status}`));
            else finish(null,{text:final||last});
          }
        });
        if(signal.aborted){abort();return;}if(rpc.closed){finish(Error('Codex 连接在启动任务前中断，请重新检查连接。'));return;}
        onStatus('正在提交任务给 Codex…');
        rpc.request('turn/start',{threadId,input:[{type:'text',text:prompt},...images.map(img=>({type:'localImage',path:img.path}))]},60000).then(r=>{turnId=r.turn.id;if(signal.aborted)abort();}).catch(e=>finish(e));
      });
    }finally{signal.removeEventListener('abort',cancelConnection);if(abort)signal.removeEventListener('abort',abort);rpc.close();}
  }
}
module.exports={CodexAdapter,Rpc,discoverCodex};
