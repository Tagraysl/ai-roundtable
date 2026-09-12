const http=require('node:http');
const {randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
class BrowserBridge {
  constructor(){this.token=randomBytes(24).toString('hex');this.job=null;this.clients=new Map();this.port=0;}
  async start(){
    this.server=http.createServer((req,res)=>this.handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(400);res.end();}));
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});
    this.port=this.server.address().port;return this.port;
  }
  async handle(req,res){
    const origin=req.headers.origin||'';
    if(origin && !origin.startsWith('chrome-extension://')){res.writeHead(403);res.end();return;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Roundtable-Token');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const token=Buffer.from(req.headers['x-roundtable-token']||'');const expected=Buffer.from(this.token);
    if(token.length!==expected.length || !timingSafeEqual(token,expected)){res.writeHead(401);res.end();return;}
    if(req.method!=='POST'){res.writeHead(405);res.end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>1500000){res.writeHead(413);res.end();req.destroy();return;}}
    const data=JSON.parse(body||'{}');let output={ok:true};
    if(req.url==='/poll'){
      const {clientId,url,memberId}=data;
      if(typeof clientId!=='string'||typeof memberId!=='string')throw Error('invalid client');
      this.clients.set(clientId,{clientId,memberId,url,at:Date.now()});
      for(const [id,c] of this.clients)if(Date.now()-c.at>120000)this.clients.delete(id);
      const job=this.job;
      output={ok:true,job:null};
      if(job && !job.owner && job.member.id===memberId && new URL(url).origin===new URL(job.member.url).origin){job.owner=clientId;output.job={id:job.id,prompt:job.prompt,selectors:job.member.selectors};}
    } else if(req.url==='/result'){
      const j=this.job;
      if(!j || j.id!==data.id || j.owner!==data.clientId){res.writeHead(409);res.end();return;}
      if(typeof data.text==='string'){j.lastText=data.text;j.onText(data.text);}
      if(data.status==='complete')j.finish(null,{text:data.text});
      else if(data.status==='error')j.finish(Error(String(data.error||'网页发送失败。')));
    } else if(req.url==='/active') output={active:!!this.job && this.job.id===data.id && this.job.owner===data.clientId};
    else if(req.url!=='/ping'){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(output));
  }
  connected(id){return [...this.clients.values()].some(c=>c.memberId===id && Date.now()-c.at<12000);}
  send({member,prompt,signal,onText=()=>{}}){
    signal.throwIfAborted();
    if(this.job)return Promise.reject(Error('另一个网页成员仍在回复。'));
    if(!this.connected(member.id))return Promise.reject(Error(`请在浏览器中打开 ${member.name}，并在「同桌 AI 网页桥」扩展中选择这个成员、连接当前窗口。`));
    return new Promise((resolve,reject)=>{
      const abort=()=>finish(Error('已停止网页请求。'));
      const timer=setTimeout(()=>finish(Error('网页回复超时；请检查登录、网页额度或选择器。')),600000);
      const finish=(error,result)=>{if(this.job?.id!==id)return;this.job=null;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(result);};
      const id=randomUUID();this.job={id,member,prompt,onText,finish,owner:null};signal.addEventListener('abort',abort,{once:true});
    });
  }
  close(){this.job?.finish(Error('程序已关闭。'));this.server?.close();}
}
module.exports={BrowserBridge};
