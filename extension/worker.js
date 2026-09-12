async function api(config,route,body) {
  const r=await fetch(`http://127.0.0.1:${config.port}${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Roundtable-Token':config.token},body:JSON.stringify(body),signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw Error(`本机连接失败 (${r.status})，请重新复制连接码。`);
  return r.json();
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  (async()=>{
    if(!['poll','result','active'].includes(msg.type))throw Error('不支持的消息。');
    const state=await chrome.storage.session.get('bindings');
    const binding=state.bindings?.[sender.tab?.id];
    if(!binding || new URL(sender.url).origin!==binding.origin)return {disconnected:true};
    const {config}=await chrome.storage.local.get('config');
    if(!config)throw Error('请先连接讨论室。');
    const clientId=String(sender.tab.id)+':'+binding.memberId;
    return api(config,'/'+msg.type,{...msg.data,clientId,memberId:binding.memberId,url:sender.url});
  })().then(reply).catch(e=>reply({error:e.message}));
  return true;
});
chrome.tabs.onUpdated.addListener(async(tabId,change,tab)=>{
  if(change.status!=='complete'||!tab.url)return;
  const {bindings={}}=await chrome.storage.session.get('bindings');
  if(bindings[tabId]&&new URL(tab.url).origin===bindings[tabId].origin) {
    try{await chrome.scripting.executeScript({target:{tabId},files:['content.js']});}catch{}
  }
});
chrome.tabs.onRemoved.addListener(async tabId=>{const {bindings={}}=await chrome.storage.session.get('bindings');delete bindings[tabId];await chrome.storage.session.set({bindings});});
