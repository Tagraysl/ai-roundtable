class WebWindow {
 constructor({BrowserWindow,root}){this.BrowserWindow=BrowserWindow;this.root=root;this.windows=new Map();this.busy=false;}
 async open(member){
  let w=this.windows.get(member.id);if(w&&!w.isDestroyed()){w.show();w.focus();return true;}
  w=new this.BrowserWindow({width:1100,height:800,title:member.name+' · 网页连接',webPreferences:{partition:'persist:roundtable-web-'+member.id,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',(e,url)=>{if(!/^https?:/.test(url))e.preventDefault();});
  this.windows.set(member.id,w);await w.loadURL(member.url);return true;
 }
 window(member){const w=this.windows.get(member.id);if(!w||w.isDestroyed())throw Error('请先打开登录窗口。');if(new URL(w.webContents.getURL()).origin!==new URL(member.url).origin)throw Error('请先完成登录并返回配置的聊天网站。');return w;}
 connected(id){const w=this.windows.get(id);return !!w&&!w.isDestroyed();}
 async pick(member,kind){
  const w=this.window(member);w.show();w.focus();
  return w.webContents.executeJavaScript(`(${function(kind){return new Promise((resolve,reject)=>{
   if(window.__roundtablePick)window.__roundtablePick();
   const banner=document.createElement('div');banner.textContent='同桌 AI：点击'+({input:'聊天输入框',send:'发送按钮',response:'一条完整的 AI 回复',busy:'生成时的停止按钮'}[kind])+'，Esc 取消';Object.assign(banner.style,{position:'fixed',top:'0',left:'0',right:'0',padding:'18px',background:'#25364b',color:'white',zIndex:2147483647,font:'16px sans-serif',pointerEvents:'none'});document.documentElement.append(banner);
   let timer;const clean=()=>{clearTimeout(timer);banner.remove();document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);delete window.__roundtablePick;};
   const cancel=()=>{clean();reject(Error('已取消点选。'));};window.__roundtablePick=cancel;const key=e=>{if(e.key==='Escape')cancel();};
   const click=e=>{e.preventDefault();e.stopImmediatePropagation();let el=e.target;if(kind==='input')el=el.closest('textarea,input,[contenteditable=true]')||el;if(kind==='send'||kind==='busy')el=el.closest('button,[role=button]')||el;
    let selector='';if(el.id)selector='#'+CSS.escape(el.id);else if(el.getAttribute('data-testid'))selector='[data-testid='+JSON.stringify(el.getAttribute('data-testid'))+']';else if(el.getAttribute('aria-label'))selector=el.tagName.toLowerCase()+'[aria-label='+JSON.stringify(el.getAttribute('aria-label'))+']';else if(el.classList.length)selector=el.tagName.toLowerCase()+[...el.classList].map(c=>'.'+CSS.escape(c)).join('');else{const parts=[];while(el&&el!==document.documentElement){const siblings=[...el.parentElement.children].filter(x=>x.tagName===el.tagName);parts.unshift(el.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(el)+1)+')');el=el.parentElement;}selector=parts.join(' > ');}
    clean();resolve(selector);
   };document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);timer=setTimeout(cancel,120000);
  });}})(${JSON.stringify(kind)})`);
 }
 async send({member,prompt,signal,onText=()=>{},onStatus=()=>{}}){
  if(this.busy)throw Error('网页正在执行另一项请求。');this.busy=true;
  try{const w=this.window(member);signal.throwIfAborted();onStatus('正在向网页发送…');
   await w.webContents.executeJavaScript(`(${function(s,prompt){
    const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';const find=q=>q&&[...document.querySelectorAll(q)].find(visible);
    const texts=()=>[...document.querySelectorAll(s.response)].filter(visible).map(e=>e.innerText.trim()).filter(Boolean);
    if(find(s.busy))throw Error('网页正在生成，请等它完成。');const el=find(s.input);if(!el)throw Error('找不到输入框，请重新点选。');if((el.value||el.innerText||'').trim())throw Error('输入框有草稿，请先处理，不会自动覆盖。');
    window.__roundtableReply={before:texts(),last:'',since:Date.now()};el.focus();
    if(['TEXTAREA','INPUT'].includes(el.tagName)){Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,prompt);el.dispatchEvent(new Event('input',{bubbles:true}));}else{const range=document.createRange();range.selectNodeContents(el);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand('insertText',false,prompt);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));}
   }} )(${JSON.stringify(member.selectors)},${JSON.stringify(prompt)})`);
   await new Promise(r=>setTimeout(r,400));signal.throwIfAborted();this.window(member);
   await w.webContents.executeJavaScript(`(${function(s,prompt){const el=[...document.querySelectorAll(s.input)].find(e=>e.getClientRects().length);if(!(el?.value||el?.innerText||'').includes(prompt.slice(0,40)))throw Error('网页未接受输入。');const b=[...document.querySelectorAll(s.send)].find(e=>e.getClientRects().length);if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')throw Error('发送按钮不可用，已保留草稿。');b.click();}})(${JSON.stringify(member.selectors)},${JSON.stringify(prompt)})`);
   onStatus('等待网页生成；不要操作此聊天窗口…');const start=Date.now();
   while(Date.now()-start<180000){await new Promise(r=>setTimeout(r,1000));signal.throwIfAborted();this.window(member);
    const result=await w.webContents.executeJavaScript(`(${function(s){const state=window.__roundtableReply;if(!state)throw Error('网页发生跳转，请重新测试连接。');const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';const list=[...document.querySelectorAll(s.response)].filter(visible).map(e=>e.innerText.trim()).filter(Boolean);const text=list.at(-1)||'';if(list.length<=state.before.length&&text===state.before.at(-1))return null;if(text!==state.last){state.last=text;state.since=Date.now();}const busy=s.busy&&[...document.querySelectorAll(s.busy)].some(visible);if(busy)state.since=Date.now();return {text,done:!!text&&!busy&&Date.now()-state.since>8000};}})(${JSON.stringify(member.selectors)})`);
    if(result?.text)onText(result.text);if(result?.done)return {text:result.text};
   }throw Error('读取回复超时，请检查登录、验证码、额度或重新点选回复区域。');
  }finally{this.busy=false;}
 }
 close(){for(const w of this.windows.values())if(!w.isDestroyed())w.close();}
}
module.exports={WebWindow};
