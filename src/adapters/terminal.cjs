const {spawn}=require('node:child_process');
class TerminalAdapter {
  constructor({cwd,timeout=600000}) {this.cwd=cwd;this.timeout=timeout;}
  send({member,prompt,signal,onText=()=>{},execute=false,workspace}) {
    return new Promise((resolve,reject)=>{
      signal.throwIfAborted();
      if(execute&&(!member.executionCapable||!workspace))throw Error('请为本地智能体启用执行能力并选择工作目录。');
      const child=spawn(member.executable,member.args||[],{cwd:execute?workspace:this.cwd,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
      let text='',done=false;
      const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);if(error)child.kill();error?reject(error):resolve({text});};
      const abort=()=>finish(Error('已停止终端请求。'));
      const timer=setTimeout(()=>finish(Error('终端回复超时。')),this.timeout);
      signal.addEventListener('abort',abort,{once:true});
      child.stdout.setEncoding('utf8');child.stderr.resume();
      child.stdout.on('data',s=>{text+=s;if(text.length>1000000)finish(Error('终端输出超过 1 MB。'));else onText(text);});
      child.on('error',()=>finish(Error('无法启动终端程序，请检查可执行文件和参数。')));
      child.on('close',code=>finish(code===0?null:Error(`终端程序退出，代码 ${code}。`)));
      child.stdin.on('error',()=>{});child.stdin.end(prompt+'\n');
    });
  }
}
module.exports={TerminalAdapter};
