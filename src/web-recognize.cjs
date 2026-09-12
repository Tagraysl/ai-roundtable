// Runs inside the isolated website. Reads DOM only; never sends a message.
function recognize(){
 const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const selector=e=>{if(e.id)return '#'+CSS.escape(e.id);for(const a of ['data-testid','aria-label','placeholder'])if(e.getAttribute(a))return e.tagName.toLowerCase()+'['+a+'='+JSON.stringify(e.getAttribute(a))+']';const classes=[...e.classList];if(classes.length)return e.tagName.toLowerCase()+classes.map(c=>'.'+CSS.escape(c)).join('');return e.tagName.toLowerCase();};
 const inputs=[...document.querySelectorAll('textarea,[contenteditable=true],[role=textbox]')].filter(visible).filter((e,i,a)=>!a.some(x=>x!==e&&x.contains(e)));
 const buttons=[...document.querySelectorAll('button,[role=button]')].filter(visible);
 const label=e=>[e.innerText,e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-testid')].filter(Boolean).join(' ');
 const send=buttons.filter(e=>/(^|\s)(send|submit)(\s|$)|send[-_ ]?(message|button)|发送|提交/i.test(label(e))&&!/stop|停止/i.test(label(e)));
 const stop=buttons.filter(e=>/stop|停止生成|停止回答/i.test(label(e)));
 const result={selectors:{},missing:[],note:'自动识别仅生成候选配置，需发送测试消息验证。'};
 for(const [key,list]of [['input',inputs],['send',send],['busy',stop]]){if(list.length===1){const s=selector(list[0]);if([...document.querySelectorAll(s)].filter(visible).length===1)result.selectors[key]=s;}if(key!=='busy'&&!result.selectors[key])result.missing.push(key);}
 for(const s of ['[data-message-author-role="assistant"]','[data-role="assistant"]','[data-testid="assistant-message"]','.assistant-message','.reply','.markdown-body','.markdown']){if([...document.querySelectorAll(s)].some(visible)){result.selectors.response=s;break;}}
 if(!result.selectors.response)result.missing.push('response');return result;
}
module.exports={recognize};
