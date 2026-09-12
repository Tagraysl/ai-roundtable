const {randomUUID}=require('node:crypto');
class ManualAdapter {
  constructor(){this.pending=null;}
  send({member,prompt,signal,manualFiles=[]}){
    signal.throwIfAborted();
    if(this.pending)throw Error('已有网页接力等待处理。');
    return new Promise((resolve,reject)=>{
      const finish=(error,text)=>{signal.removeEventListener('abort',abort);this.pending=null;error?reject(error):resolve({text});};
      const abort=()=>finish(Error('已停止网页接力。'));
      this.pending={id:randomUUID(),memberId:member.id,name:member.name,prompt,manualFiles,finish};
      signal.addEventListener('abort',abort,{once:true});
    });
  }
  status(){if(!this.pending)return null;const {id,memberId,name,prompt,manualFiles}=this.pending;return {id,memberId,name,prompt,manualFiles};}
  submit(id,text){
    if(!this.pending||this.pending.id!==id)throw Error('这次接力已结束或被取消。');
    if(typeof text!=='string'||!text.trim()||text.length>100000)throw Error('请粘贴有效回复（最多 100,000 字符）。');
    this.pending.finish(null,text.trim());
  }
}
module.exports={ManualAdapter};
