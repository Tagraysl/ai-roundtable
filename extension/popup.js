const $=id=>document.getElementById(id);
let config;
function populate(c){config=c;$('member').replaceChildren();for(const m of c.members||[]){const o=document.createElement('option');o.value=m.id;o.textContent=m.name;$('member').append(o);}}
function parse(){const c=JSON.parse($('code').value);if(!Number.isInteger(c.port)||c.port<1||c.port>65535||!/^\w{48}$/.test(c.token)||!Array.isArray(c.members))throw Error('连接码格式无效。');populate(c);}
$('code').addEventListener('input',()=>{try{parse();$('status').textContent='选择这个网页对应的成员。';}catch{$('status').textContent='请粘贴完整连接码。';}});
chrome.storage.local.get('config').then(r=>{if(r.config)populate(r.config);});
$('connect').onclick=async()=>{
  try {
    if(!config)parse();
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const m=config.members.find(x=>x.id===$('member').value);if(!m)throw Error('请选择网页成员。');
    const origin=new URL(m.url).origin;if(!tab.url||new URL(tab.url).origin!==origin)throw Error('请先打开 '+m.url+'，再连接此标签页。');
    if(!await chrome.permissions.request({origins:[origin+'/*']}))throw Error('需要你允许扩展访问这个 AI 网站。');
    const response=await fetch(`http://127.0.0.1:${config.port}/ping`,{method:'POST',headers:{'X-Roundtable-Token':config.token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('连接码已过期，请从桌面软件重新复制。');
    await chrome.storage.local.set({config});
    const {bindings={}}=await chrome.storage.session.get('bindings');
    for(const [id,b]of Object.entries(bindings))if(b.memberId===m.id)delete bindings[id];
    bindings[tab.id]={memberId:m.id,origin};await chrome.storage.session.set({bindings});
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    $('code').value='';$('status').textContent='已连接。保持此标签页打开，然后回桌面软件发送讨论。';
  }catch(e){$('status').textContent=e.message;}
};
$('disconnect').onclick=async()=>{const[tab]=await chrome.tabs.query({active:true,currentWindow:true});const{bindings={}}=await chrome.storage.session.get('bindings');delete bindings[tab.id];await chrome.storage.session.set({bindings});$('status').textContent='已断开当前标签页。';};
