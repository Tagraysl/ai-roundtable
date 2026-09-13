const $=id=>document.getElementById(id),call=(name,args)=>window.roundtable.call(name,args);
let state,roomId,selected=new Set(),editingId,starting=false;
const welcome=$('messages').innerHTML;
const kinds={web:'网页接力',codex:'本机智能体',api:'API 模型',terminal:'终端程序'};
let noticeScope='';
function noticeContext(){const r=state?.rooms?.find(r=>r.id===roomId);return JSON.stringify([roomId,r?.workflowId||'',r?.usageMode||'discussion']);}
function notify(text){noticeScope=text?noticeContext():'';$('notice').textContent=text;$('notice').hidden=!text;}
function bind(id,fn){$(id).addEventListener('click',()=>{const scope=noticeContext();return Promise.resolve().then(fn).catch(e=>{if(scope===noticeContext())notify(e.message);});});}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function room(){return state.rooms.find(r=>r.id===roomId)||state.rooms[0];}
function avatar(m){return el('span',m.kind==='web'?'✳':m.kind==='codex'?'⌘':m.kind==='api'?'◈':'›_',`avatar ${m.kind}`);}
function renderMembers(){
  $('members').replaceChildren();
  for(const m of state.members.filter(m=>!m.apiParent)){const unavailable=m.kind==='terminal'||(m.kind==='web'&&m.webMode==='automation');if(unavailable)selected.delete(m.id);const card=el('label',undefined,'member-card'+(selected.has(m.id)?' selected':''));card.append(avatar(m));const info=el('div');info.append(el('strong',m.name),el('small',kinds[m.kind]+' · '+(m.kind==='web'?(m.webMode!=='automation'?'手动接力':m.connected?'已连接':'待连接'):m.kind==='api'?(m.hasKey?'已配置':'待配置'):'可检查连接')));card.append(info);const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(m.id);check.disabled=!!state.active||unavailable;if(unavailable)info.append(el('small','此接入暂不开放，请在“管理 AI”中修改接入方式'));check.onchange=()=>{check.checked?selected.add(m.id):selected.delete(m.id);renderMembers();};card.append(check);$('members').append(card);}
  count();
}
function count(){$('call-count').textContent=`最多 ${selected.size*Number($('rounds').value)} 次回复`;}
function roomDisplayTitle(r){return r.title==='新的讨论'&&!r.messages.length&&$('ui-language')?.value==='en'?'New discussion':r.title;}
function renderRooms(){$('rooms').replaceChildren();for(const r of state.rooms){const row=el('div',undefined,'room-row'),b=el('button',roomDisplayTitle(r),'room'+(r.id===roomId?' active':''));b.append(el('small',`${r.messages.filter(m=>m.role==='assistant'&&m.status==='complete').length} 条回复`));b.onclick=()=>{roomId=r.id;$('discussion-nav')?.click();render();};const remove=el('button','×','room-delete');remove.title='删除讨论：'+r.title;remove.setAttribute('aria-label',remove.title);remove.onclick=async()=>{try{state=await call('deleteRoom',{id:r.id});render();}catch(e){notify(e.message);}};row.append(b,remove);$('rooms').append(row);}}
function renderText(container,text){
  container.replaceChildren();const pieces=text.split(/(```[\s\S]*?```)/g);
  for(const piece of pieces){if(piece.startsWith('```')){const body=piece.replace(/^```[^\n]*\n?/,'').replace(/```$/,'');container.append(el('pre',body));}else{const lines=piece.split('\n');lines.forEach((line,i)=>{if(/^#{1,4} /.test(line))container.append(el('h3',line.replace(/^#{1,4} /,'')));else{const parts=line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);for(const part of parts){if(part.startsWith('**')&&part.endsWith('**'))container.append(el('strong',part.slice(2,-2)));else if(part.startsWith('`')&&part.endsWith('`'))container.append(el('code',part.slice(1,-1)));else container.append(document.createTextNode(part));}if(i<lines.length-1)container.append(document.createTextNode('\n'));}});}}
}
function renderMessages(){const area=$('messages'),nearBottom=area.scrollHeight-area.scrollTop-area.clientHeight<100;if(!room().messages.length){area.innerHTML=welcome;bindExamples();return;}const retained=new Map([...area.children].map(e=>[e.dataset.messageId,e]));const wanted=new Set(room().messages.map(m=>m.id));for(const child of [...area.children])if(!wanted.has(child.dataset.messageId))child.remove();let position=0;for(const m of room().messages){const signature=JSON.stringify([m,state.members.find(x=>x.id===m.memberId)?.kind,m.mode==='workflow'&&['error','cancelled'].includes(m.status)?!!state.active:null]);const previous=retained.get(m.id);if(previous?._messageSignature===signature){if(area.children[position]!==previous)area.insertBefore(previous,area.children[position]||null);position++;continue;}const line=el('article',undefined,'message '+m.role);line._messageSignature=signature;line.dataset.messageId=m.id;if(m.role!=='user')line.append(avatar(state.members.find(x=>x.id===m.memberId)||{kind:'api'}));const content=el('div',undefined,'message-content');const meta=el('div',undefined,'message-meta');meta.append(el('strong',(m.mode==='workflow-output'?($('ui-language')?.value==='en'?'Final result':'最终结果'):(m.name||'你'))+(m.model?' / '+m.model:'')),el('span',m.role==='assistant'?(m.mode==='workflow-output'?($('ui-language')?.value==='en'?'Workflow delivery':'工作流交付'):m.mode==='workflow'?'工作流节点':m.mode==='summary'?'讨论汇总':`第 ${m.round} 轮`):'发起讨论'));if(m.status==='running')meta.append(el('span',m.progress||'等待成员响应…','status-tag'));else if(m.status==='cancelled')meta.append(el('span','已停止','status-tag'));if(m.omitted)meta.append(el('span',`已省略 ${m.omitted} 条较早上下文`,'status-tag'));const copy=el('button','复制','copy');copy.dataset.uiText='';copy.onclick=()=>navigator.clipboard.writeText(m.text).catch(e=>notify(e.message));meta.append(copy);content.append(meta);if(m.skills?.length)content.append(el('small','Skills: '+m.skills.map(s=>s.name+' v'+s.revision).join(' · '),'skill-usage'));const body=el('div',undefined,'message-body');renderText(body,m.text|| (m.status==='running'?(m.progress||'等待成员响应…'):''));content.append(body);if(m.error)content.append(el('div',m.error,'message-error'));if(m.mode==='workflow'&&['error','cancelled'].includes(m.status)){const retry=el('button','重试此积木','message-retry');retry.disabled=!!state.active;retry.title='只重试此积木，并继续依赖它的步骤。其他失败积木保留，需分别重试。';retry.onclick=async()=>{if(!confirm('重试此积木并继续其依赖步骤？其他失败积木不会重新请求，已完成结果保留。本积木若仅有部分回答，将重新生成，可能产生调用费用。'))return;retry.disabled=true;try{state=await call('roomWorkflowRetry',{id:roomId,runId:m.runId,nodeId:m.nodeId});render();}catch(e){notify(e.message);retry.disabled=false;}};content.append(retry);}line.append(content);if(previous?.parentNode===area)previous.replaceWith(line);else area.insertBefore(line,area.children[position]||null);position++;}if(nearBottom)area.scrollTop=area.scrollHeight;}
function render(){if(noticeScope&&noticeScope!==noticeContext())notify('');if(!state.rooms.some(r=>r.id===roomId))roomId=state.rooms[0].id;renderRooms();renderMembers();$('room-title').textContent=roomDisplayTitle(room());renderMessages();$('materials').replaceChildren();for(const m of room().materials||[]){const chip=el('span',m.name,'material'),b=el('button','×');b.disabled=!!state.active;b.onclick=async()=>{try{state=await call('removeMaterial',{id:roomId,materialId:m.id});render();}catch(e){notify(e.message);}};chip.append(b);$('materials').append(chip);}renderBusy();window.runErrorUI?.refresh();}
function renderBusy(){const busy=!!state.active||starting;$('stop').hidden=!busy;$('send').disabled=busy;$('summary').disabled=busy;$('attach').disabled=busy;$('new-room').disabled=busy;$('settings').disabled=busy;$('rounds').disabled=busy;$('activity').textContent=busy?'成员正在交流 · 可随时停止':'准备就绪';}
function bindExamples(){if(window.quickTaskUI){window.quickTaskUI.render();return;}document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{$('prompt').value=b.dataset.example;$('prompt').focus();});}
async function refresh(){state=await call('state');if(!roomId){roomId=state.rooms[0].id;selected=new Set(state.members.filter(m=>!m.apiParent).map(m=>m.id));}render();}
async function send(mode='discussion',forcedIds){
  if(starting||state.active)return;
  notify('');
  if(room().workflowId&&mode==='discussion'){starting=true;renderBusy();try{state=await call('roomWorkflowStart',{id:roomId,text:$('prompt').value});$('prompt').value='';render();}finally{starting=false;renderBusy();}return;}
  let text=$('prompt').value,ids=forcedIds||[...selected];
  const mentions=[...text.matchAll(/@([^\s，。,:：]+)/g)].map(x=>x[1].toLowerCase());
  if(!forcedIds&&mentions.length){if(mentions.includes('all'))ids=state.members.filter(m=>!m.apiParent).map(m=>m.id);else{const matched=state.members.filter(m=>mentions.includes(m.id.toLowerCase())||mentions.includes(m.name.toLowerCase()));if(matched.length)ids=matched.map(m=>m.id);}}
  starting=true;renderBusy();notify('');
  try{state=await call('start',{id:roomId,text,memberIds:ids,rounds:mode==='summary'?1:Number($('rounds').value),mode});$('prompt').value='';render();}
  finally{starting=false;renderBusy();window.runErrorUI?.refresh();}
}
function editMember(id){
  editingId=id;const m=state.members.find(m=>m.id===id)||{id:'member_'+Date.now().toString(36),name:'新的成员',kind:'api',format:'openai',role:'',selectors:{},args:[]};
  $('web-mode').value=m.webMode||'manual';$('web-transport').value=m.webTransport||(id?'extension':'window');$('web-permission').checked=!!m.automationAcknowledged;
  if($('member-vision'))$('member-vision').checked=m.vision===true;
  if($('member-execution'))$('member-execution').checked=m.executionCapable===true;

  $('member-id').value=m.id;$('member-name').value=m.name;$('member-kind').value=m.kind;$('member-role').value=m.role||'';window.roleUI?.sync().catch(()=>{});$('member-url').value=m.url||'';$('member-format').value=m.format||'openai';$('member-base').value=m.baseUrl||'';$('member-key').value='';$('clear-key').checked=false;$('member-model').value=m.model||'';$('member-executable').value=m.executable||'';$('member-args').value=JSON.stringify(m.args||[]);for(const k of ['input','send','response','busy'])$('selector-'+k).value=m.selectors?.[k]||'';$('form-status').textContent=m.hasKey?'已保存加密密钥，留空可保留。':'';$('remove-member').hidden=!id;showKind();renderMemberList();
}
function showKind(){const kind=$('member-kind').value;document.querySelectorAll('[data-kind]').forEach(x=>x.hidden=!x.dataset.kind.split(' ').includes(kind));$('login').hidden=kind!=='codex';}
function renderMemberList(){$('member-list').replaceChildren();for(const m of state.members.filter(m=>!m.apiParent)){const b=el('button',m.name,m.id===editingId?'active':'');b.onclick=()=>editMember(m.id);$('member-list').append(b);}}
function formMember(){const kind=$('member-kind').value,m={id:$('member-id').value,name:$('member-name').value.trim(),kind,role:$('member-role').value};if(kind==='web'){m.url=$('member-url').value.trim();m.webTransport=$('web-transport').value;m.selectors={};for(const k of ['input','send','response','busy'])m.selectors[k]=$('selector-'+k).value.trim();}if(kind==='api'){m.baseUrl=$('member-base').value.trim();m.format=$('member-format').value;}if(kind==='api'||kind==='codex')m.model=$('member-model').value.trim();if(kind==='terminal'||kind==='codex')m.executable=$('member-executable').value.trim();if(kind==='terminal')m.args=JSON.parse($('member-args').value||'[]');return m;}
async function saveMember(){const member=formMember();if(member.kind==='terminal')member.executionCapable=$('member-execution')?.checked===true;if(member.kind==='api')member.vision=$('member-vision')?.checked===true;if(member.kind==='web'){member.webMode=$('web-mode').value;member.automationAcknowledged=$('web-permission').checked;}state=await call('saveMember',{member,key:$('member-key').value,clearKey:$('clear-key').checked});selected.add(member.id);editMember(member.id);render();$('form-status').textContent='已保存。';return member;}
$('member-form').onsubmit=e=>{e.preventDefault();saveMember().catch(e=>$('form-status').textContent=e.message);};
$('member-kind').onchange=showKind;$('rounds').onchange=count;
bind('settings',()=>{editMember(state.members[0]?.id);$('settings-dialog').showModal();});
bind('add-member',()=>editMember(null));
bind('choose-exe',async()=>{const p=await call('chooseExe');if(p)$('member-executable').value=p;});
bind('remove-member',async()=>{if(!confirm('移除这个成员？已有讨论记录会保留。'))return;state=await call('removeMember',{id:editingId});selected.delete(editingId);editMember(state.members[0]?.id);render();});
bind('probe',async()=>{try{const m=await saveMember();$('form-status').textContent='正在检查…';const r=await call('probe',{id:m.id});if(r.models){$('model-options').replaceChildren();for(const name of r.models){const o=el('option');o.value=name;$('model-options').append(o);}}$('form-status').textContent=r.message||(r.authenticated?'Codex 已连接，已检测到账号登录。':r.connected?'连接已建立；尚未检测到账号登录。':'尚未连接。');}catch(e){$('form-status').textContent=e.message;}});
bind('login',async()=>{try{const m=await saveMember();$('form-status').textContent='请在打开的浏览器中完成 Codex 登录…';await call('login',{id:m.id});$('form-status').textContent='Codex 登录完成。';}catch(e){$('form-status').textContent=e.message;}});
bind('new-room',async()=>{const r=await call('newRoom');roomId=r.id;notify('');await refresh();});
bind('data-folder',()=>call('dataFolder'));bind('attach',()=>window.attachmentUI.open('room:'+roomId,()=>refresh()));bind('export',()=>call('export',{id:roomId}));
bind('stop',()=>call('stop'));bind('send',()=>send());
bind('summary',()=>{$('summary-member').replaceChildren();for(const m of state.members.filter(m=>!m.apiParent)){const o=el('option',m.name);o.value=m.id;o.selected=m.id==='codex';$('summary-member').append(o);}$('summary-dialog').showModal();});
bind('do-summary',async()=>{const id=$('summary-member').value;$('summary-dialog').close();await send('summary',[id]);});
bind('bridge-help',()=>{$('web-links').replaceChildren();for(const m of state.members.filter(m=>m.kind==='web')){const b=el('button','打开 '+m.name+' ↗');b.onclick=()=>call('openWeb',{id:m.id}).catch(e=>notify(e.message));$('web-links').append(b);}$('bridge-dialog').showModal();});
bind('extension-folder',()=>call('extensionFolder'));bind('copy-code',async()=>{await call('pair');$('copy-code').textContent='已复制 · 去浏览器扩展粘贴';});
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('prompt').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();send().catch(e=>notify(e.message));}});
let messageFrame=null;function scheduleMessages(){if(messageFrame!==null)return;messageFrame=setTimeout(()=>{messageFrame=null;renderMessages();},60);}
window.roundtable.subscribe(e=>{
  if(!state)return;
  if(e.type==='message'){const r=state.rooms.find(r=>r.id===e.roomId);if(r){const index=r.messages.findIndex(m=>m.id===e.message.id);if(index>=0)r.messages[index]=e.message;else r.messages.push(e.message);if(e.roomId===roomId)scheduleMessages();}}
  if(e.type==='running'){state.active={roomId:e.roomId};renderBusy();window.runErrorUI?.refresh();}
  if(e.type==='idle'){state.active=null;refresh().catch(e=>notify(e.message));}
  if(e.type==='failure'||e.type==='workflowFailure')notify(e.error);
});
setInterval(async()=>{try{const s=await call('membersState');if(state&&JSON.stringify(state.members)!==JSON.stringify(s.members)){state.members=s.members;renderMembers();}}catch{}},3000);
refresh().catch(e=>notify(e.message));
let manualJob=null;
bind('manual-copy',async()=>{if(manualJob){await call('manualCopy',{id:manualJob.id});$('manual-status').textContent='已复制。请到原网页粘贴、发送，再将回复粘贴回来。';}});
bind('manual-open',()=>manualJob&&call('openWeb',{id:manualJob.memberId}));
bind('manual-submit',async()=>{if(manualJob){await call('manualSubmit',{id:manualJob.id,text:$('manual-reply').value,filesUploaded:$('manual-files-uploaded')?.checked===true});$('manual-dialog').close();manualJob=null;}});
bind('manual-stop',()=>call('stop'));
$('manual-dialog').addEventListener('cancel',e=>e.preventDefault());
setInterval(async()=>{try{const job=await call('manualStatus');if(job&&job.id!==manualJob?.id){manualJob=job;$('manual-title').textContent=job.name+' · 手动接力';$('manual-prompt').value=job.prompt;$('manual-reply').value='';$('manual-status').textContent='本程序不会读取、填写或点击该网页。';if(!$('manual-dialog').open)$('manual-dialog').showModal();}else if(!job&&manualJob){manualJob=null;$('manual-dialog').close();}}catch(e){notify(e.message);}},750);

