(()=>{
  if(globalThis.__roundtableInstalled)return;globalThis.__roundtableInstalled=true;
  let working=false;
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=e=>!!e&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const find=s=>[...document.querySelectorAll(s)].find(visible);
  const send=(type,data={})=>chrome.runtime.sendMessage({type,data});
  const status=document.createElement('div');status.textContent='同桌 AI · 已连接';
  Object.assign(status.style,{position:'fixed',right:'14px',bottom:'12px',zIndex:'2147483647',background:'#215c4d',color:'white',font:'12px system-ui',padding:'7px 12px',borderRadius:'20px',pointerEvents:'none'});document.documentElement.append(status);
  const stopButton=s=>{if(!s)return;const b=[...document.querySelectorAll(s)].find(e=>visible(e)&&e.tagName==='BUTTON');b?.click();};
  async function processJob(job){
    const s=job.selectors;
    const snapshots=()=>{
      const all=[...document.querySelectorAll(s.response)].filter(visible);
      return all.filter(e=>!all.some(other=>other!==e&&other.contains(e))).map(e=>(e.innerText||e.textContent||'').trim()).filter(Boolean);
    };
    const busy=()=>s.busy&&!!find(s.busy);
    if(busy())throw Error('网页正在生成其他回复，请等它完成再试。');
    const input=find(s.input);if(!input)throw Error('找不到网页输入框。请完成登录，或在成员设置中调整选择器。');
    if((input.value||input.innerText||'').trim())throw Error('网页输入框已有草稿，请先发送或清空；同桌 AI 不会覆盖它。');
    const before=snapshots();input.focus();
    if(input.tagName==='TEXTAREA'||input.tagName==='INPUT'){
      const proto=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(input,job.prompt);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }else{
      const sel=getSelection(),range=document.createRange();range.selectNodeContents(input);sel.removeAllRanges();sel.addRange(range);
      document.execCommand('insertText',false,job.prompt);
      input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:job.prompt}));
    }
    await pause(350);
    if(!(input.value||input.innerText||'').includes(job.prompt.slice(0,40)))throw Error('网页没有接受输入，请检查编辑框适配。');
    const active=await send('active',{id:job.id});if(!active.active)throw Error('请求已取消，输入框中保留了未发送的草稿。');
    const button=find(s.send);if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')throw Error('发送按钮不可用，已保留草稿；请检查网页额度或选择器。');
    button.click();status.textContent='同桌 AI · 等待网页回复';
    let last='',stableAt=Date.now();const start=Date.now();
    while(Date.now()-start<590000){
      await pause(1000);
      const alive=await send('active',{id:job.id});
      if(!alive.active){stopButton(s.busy);status.textContent='同桌 AI · 请求已停止';return;}
      const after=snapshots();const text=after.at(-1)||'';
      const changed=after.length>before.length||(text&&text!==before.at(-1));
      if(!changed)continue;
      if(text!==last){last=text;stableAt=Date.now();await send('result',{id:job.id,status:'progress',text});}
      if(busy()){stableAt=Date.now();continue;}
      if(last&&Date.now()-stableAt>=6000){await send('result',{id:job.id,status:'complete',text:last});status.textContent='同桌 AI · 已收回回复';return;}
    }
    throw Error('网页回复超时。请检查是否登录失效、达到额度或网页结构已改变。');
  }
  async function tick(){
    if(working)return;
    try{
      const result=await send('poll');
      if(result.disconnected){status.textContent='同桌 AI · 未连接';return;}
      if(result.error){status.textContent='同桌 AI · 桌面连接已断开';return;}
      if(!result.job){status.textContent='同桌 AI · 已连接';return;}
      working=true;
      try{await processJob(result.job);}catch(e){status.textContent='同桌 AI · 需要检查';await send('result',{id:result.job.id,status:'error',error:e.message});}finally{working=false;}
    }catch{status.textContent='同桌 AI · 等待重新连接';}
  }
  setInterval(tick,1500);tick();
})();
