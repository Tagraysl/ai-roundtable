const {app,BrowserWindow,ipcMain,dialog,shell,safeStorage,clipboard,net,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {defaults,validateMember,Store,newRoom,Discussion,exportMarkdown}=require('./core.cjs');
const {ApiAdapter}=require('./adapters/api.cjs');
const {NetworkTools}=require('./network.cjs');
const {roomContext,syncRunToRoom}=require('./room-workflows.cjs');
const {exportDocument}=require('./export.cjs');
const {CodexAdapter,discoverCodex}=require('./adapters/codex.cjs');
const {TerminalAdapter}=require('./adapters/terminal.cjs');
const {BrowserBridge}=require('./bridge.cjs');
const {ManualAdapter}=require('./adapters/manual.cjs');
const manual=new ManualAdapter();
const {createWorkflows}=require('./workflow-ipc.cjs');
let workflows,webWindow,plugins,skills,roleTemplates,quickTasks,modelCatalog;
function stableMember(m){if(m.kind==='terminal'||(m.kind==='web'&&m.webMode==='automation'))throw Error('此接入仍在试验，当前版本暂停使用。请改用 API、Codex 或网页手动接力；原配置已保留。');}
function webConnected(m){return m.webTransport==='window'?webWindow?.connected(m.id):bridge.connected(m.id);}
function wizardMember(raw){throw Error('网页自动接入暂时下线，原配置已保留。');if(!webWindow)throw Error('请先在插件管理中安装并启用网页自动连接。');const m={...raw,kind:'web',webMode:'automation',webTransport:'window'};validateMember({...m,selectors:{input:'textarea',send:'button',response:'div'}});return m;}
const {Attachments,attachmentNote}=require('./attachments.cjs');
let attachments;
const qa=process.argv.includes('--qa');
const sourceRoot=path.resolve(__dirname,'..');
const portableRoot=require('./platform-paths.cjs').storageRoot({packaged:app.isPackaged,executable:process.execPath,sourceRoot,appData:app.getPath('appData'),qa,temp:app.getPath('temp')});
fs.mkdirSync(portableRoot,{recursive:true});
app.setPath('userData',path.join(portableRoot,'instance'));
const primary=qa||app.requestSingleInstanceLock();
const dataLocation=require('./data-location.cjs');
const location=qa?{path:path.join(portableRoot,`qa/test-data-${process.pid}`)}:primary?dataLocation.resolve(portableRoot):{path:path.join(portableRoot,'data')};
const dataRoot=location.path;
app.setPath('userData',dataRoot);
app.setName('AI Roundtable');
let win,store,settings,rooms,secrets,bridge,engine,api,codex,terminal;
function emit(event){if(win&&!win.isDestroyed())win.webContents.send('roundtable:event',event);}
function saveRooms(){store.write('rooms',rooms);}
function unlocked(id){const s=secrets[id];if(!s)return '';try{return safeStorage.decryptString(Buffer.from(s,'base64'));}catch{throw Error('API 密钥无法在当前系统账户解密，请重新填写。');}}
function state(){return {members:settings.members.map(m=>({...m,hasKey:!!secrets[m.id],connected:m.kind==='web'?webConnected(m):undefined})),rooms,active:engine.active?{roomId:engine.active.roomId}:workflows?.runner.active?{roomId:workflows.runner.active.run.roomId||null,workflow:true}:null,bridgePort:bridge.port,dataRoot,version:app.getVersion()};}
function assertIdle(){if(engine.active||workflows?.runner.active||attachments?.busy||webWindow?.busy)throw Error('请先停止或等待当前讨论、工作流或附件解析完成。');}
function roomById(id){const r=rooms.find(r=>r.id===id);if(!r)throw Error('讨论不存在。');return r;}
function memberById(id){const m=settings.members.find(m=>m.id===id);if(!m)throw Error('成员不存在。');return m;}
const handlers={
  roomWorkflowRetry:async({id,runId,nodeId})=>{roomById(id);await workflows.retryInRoom({roomId:id,runId,nodeId});return state();},
  roomOptions:({id,usageMode,soloMember,soloModel,contextMode,contextMessageIds,contextMaterialIds})=>{assertIdle();const r=roomById(id);if(usageMode!==undefined){if(!['solo','discussion','workflow'].includes(usageMode))throw Error('无效使用方式');r.usageMode=usageMode;if(usageMode!=='workflow'){if(r.workflowId)r.lastWorkflowId=r.workflowId;r.workflowId='';}else r.workflowId=r.lastWorkflowId||workflows.handlers.workflowState().graphs[0]?.id||'';}if(soloMember!==undefined){memberById(soloMember);r.soloMember=soloMember;}if(soloModel!==undefined){if(typeof soloModel!=='string'||soloModel.length>200)throw Error('Invalid model');r.soloModel=soloModel;}if(contextMode!==undefined){if(!['continue','none','custom'].includes(contextMode))throw Error('无效上下文范围');r.contextMode=contextMode;}for(const [key,ids,valid]of [['contextMessageIds',contextMessageIds,r.messages.map(m=>m.id)],['contextMaterialIds',contextMaterialIds,(r.materials||[]).map(m=>m.attachmentId||m.id)]])if(ids!==undefined){if(!Array.isArray(ids)||ids.some(x=>!valid.includes(x)))throw Error('所选内容不属于本对话');r[key]=[...new Set(ids)];}saveRooms();return state();},
  roomHandoff:({id,memberId})=>require('./handoff.cjs').preview(roomById(id),memberId?memberById(memberId):null,workflows.handlers.workflowState().runs),
  roomAdoptAttachment:({id,attachmentId})=>{assertIdle();const r=roomById(id);if(!require('./handoff.cjs').candidates(r,workflows.handlers.workflowState().runs).some(a=>a.attachmentId===attachmentId))throw Error('附件不属于本对话的既有工作记录。');const scope='room:'+id,ids=attachments.registry.scopes[scope]||[];if(ids.length>=10)throw Error('每个对话最多10个附件。');if(!attachments.registry.items[attachmentId])throw Error('原附件已不可用，请重新添加。');attachments.registry.scopes[scope]=[...new Set([...ids,attachmentId])];attachments.save(scope);return state();},
  roomWorkflowSet:({id,graphId,workspace})=>{assertIdle();const r=roomById(id);if(graphId&&!workflows.handlers.workflowState().graphs.some(g=>g.id===graphId))throw Error('模板不存在。');r.workflowId=graphId||'';r.usageMode=graphId?'workflow':'discussion';if(workspace!==undefined){if(typeof workspace!=='string')throw Error('目录格式错误。');r.workflowWorkspace=workspace;}saveRooms();return state();},
  roomWorkflowStart:({id,text})=>{const r=roomById(id);workflows.startInRoom({graphId:r.workflowId,task:text,workspace:r.workflowWorkspace||'',roomId:id,materials:roomContext(require('./conversation-context.cjs').view(r)),includeGraphAttachments:!r.contextMode||r.contextMode==='continue',attachments:(require('./conversation-context.cjs').view(r).materials||[]).filter(m=>m.attachmentId),beforeStart:()=>{r.messages.push({id:randomUUID(),role:'user',name:'你',text:text.trim(),status:'complete',at:new Date().toISOString()});if(r.title==='新的讨论')r.title=text.trim().slice(0,28);saveRooms();emit({type:'running',roomId:id});}});return state();},
  runtimeStatus:()=>{if(engine.active){const a=engine.active,m=[...a.room.messages].reverse().find(m=>m.status==='running');return {kind:'discussion',id:a.roomId,name:a.member?.name||'讨论',canRestart:a.member?.kind==='api'&&!!a.request,progress:m?.progress||'正在等待回复…',startedAt:m?.at};}const r=workflows?.runner.active?.run;if(r){return {kind:'workflow',id:r.id,name:r.graph.name,canRestart:false,startedAt:r.createdAt,progress:r.graph.nodes.filter(n=>['running','waiting','queued'].includes(r.nodes[n.id].status)).map(n=>n.title+' · '+({running:'处理中',waiting:'等待确认',queued:'排队中'}[r.nodes[n.id].status])).join('；')||'等待下一步'};}return null;},
  skipMember:({id})=>{if(engine.active?.roomId!==id)throw Error('讨论已经结束或发生变化。');engine.skip();return true;},
  steeringStatus:()=>engine.active?{kind:'discussion',id:engine.active.roomId,name:engine.active.member?.name||'讨论',canRestart:engine.active.member?.kind==='api'&&!!engine.active.request}:workflows?.runner.active?{kind:'workflow',id:workflows.runner.active.run.id,name:workflows.runner.active.run.graph.name,canRestart:false}:null,
  steer:({kind,id,text,restart})=>{if(kind==='discussion'&&engine.active?.roomId===id)return engine.steer(text,restart===true);if(kind==='workflow'&&workflows?.runner.active?.run.id===id){if(restart)throw Error('工作流中不自动中断执行；请选择后续节点生效。');return workflows.runner.steer(text);}throw Error('目标运行已经结束或发生变化，补充未发送。');},
  quickTasks:()=>quickTasks.list(),
  quickTaskSave:({task})=>quickTasks.save(task),
  quickTaskDelete:async({id})=>{const t=quickTasks.list().find(t=>t.id===id);if(!t)throw Error('任务不存在。');const r=await dialog.showMessageBox(win,{type:'question',message:'删除常用任务：'+t.name+'？',detail:'仅删除快捷任务，已有聊天记录和输入内容保留。',buttons:['取消','删除'],defaultId:0,cancelId:0});if(r.response!==1)return false;quickTasks.remove(id);return true;},
  roleTemplates:()=>roleTemplates.list(),
  roleTemplateSave:({template})=>{assertIdle();return roleTemplates.save(template);},
  roleTemplateDelete:async({id})=>{assertIdle();const t=roleTemplates.list().find(t=>t.id===id);if(!t||t.builtin)throw Error('请选择自定义职责模板。');const r=await dialog.showMessageBox(win,{type:'question',message:'删除职责模板：'+t.name+'？',detail:'已经填入成员和积木的职责文本不会改变。',buttons:['取消','删除'],defaultId:0,cancelId:0});assertIdle();if(r.response!==1)return false;roleTemplates.remove(id);return true;},
  skillsList:()=>skills.list(),
  skillsSave:({skill})=>{assertIdle();return skills.save(skill);},
  skillsDelete:async({id})=>{assertIdle();const s=skills.list().find(s=>s.id===id);if(!s)throw Error('技能不存在');const r=await dialog.showMessageBox(win,{type:'warning',message:'删除技能：'+s.name+'？',detail:'历史使用记录保留。引用此技能的节点需要重新配置。',buttons:['取消','删除'],defaultId:0,cancelId:0});assertIdle();if(r.response!==1)return false;skills.remove(id);return true;},
  skillsImport:async()=>{assertIdle();const r=await dialog.showOpenDialog(win,{title:'导入技能说明（Markdown / TXT）',properties:['openFile'],filters:[{name:'技能说明',extensions:['md','txt']}]});if(r.canceled)return null;const file=r.filePaths[0];if(fs.statSync(file).size>100000)throw Error('技能文件过大。');const content=fs.readFileSync(file,'utf8');if(content.length>16000)throw Error('技能正文超过 16,000 字。');return {name:path.basename(file,path.extname(file)),content};},
  pluginStatus:()=>plugins.status(),
  pluginChange:async({action})=>{assertIdle();if(['install','enable'].includes(action))throw Error('网页自动连接尚不成熟，当前版本暂不开放。');if(action==='remove'){const r=await dialog.showMessageBox(win,{type:'question',message:'卸载网页自动连接插件？',detail:'移除已安装的执行模块，保留聊天、成员配置和登录数据。可随时重新安装。',buttons:['取消','卸载'],defaultId:0,cancelId:0});if(r.response!==1)return plugins.status();assertIdle();}webWindow?.close();webWindow=null;const result=plugins.set(action);webWindow=plugins.create({BrowserWindow,root:dataRoot});return result;},
  webWindowOpen:async({member})=>{assertIdle();return webWindow.open(wizardMember(member));},
  webWindowDetect:async({member})=>{assertIdle();const m=wizardMember(member);return webWindow.window(m).webContents.executeJavaScript('('+require('./web-recognize.cjs').recognize.toString()+')()');},
  webWindowPick:async({member,kind})=>{assertIdle();if(!['input','send','response','busy'].includes(kind))throw Error('Unknown field');return webWindow.pick(wizardMember(member),kind);},
  webWindowTest:async({member})=>{assertIdle();const m=wizardMember(member);validateMember(m);const response=await webWindow.send({member:m,prompt:'这是连接测试，请只回复：连接成功',signal:AbortSignal.timeout(90000)});if(response.text.trim()!=='连接成功')throw Error('读到了内容，但不符合测试回复。请确认选中的是 AI 回复区域，然后重试。');return {message:'发送与读取测试通过。请保存成员。'};},
  windowState:()=>({fullscreen:win.isFullScreen(),zoom:win.webContents.getZoomFactor()}),
  windowAction:({action})=>{require('./window-controls.cjs').action(win,action);return true;},
  nativeLanguage:({language})=>{if(!['zh','en'].includes(language))throw Error('Invalid language');require('./native-menu.cjs').install({Menu,app,window:win,language});return true;},
  dataLocation:()=>({current:dataRoot,pending:qa?'':dataLocation.read(portableRoot).pending||''}),
  dataLocationChoose:async()=>{assertIdle();const result=await dialog.showOpenDialog(win,{title:'选择空文件夹 · 下次启动复制迁移，保留原数据',properties:['openDirectory','createDirectory']});if(result.canceled)return handlers.dataLocation();assertIdle();dataLocation.schedule(qa?dataRoot:portableRoot,dataRoot,result.filePaths[0]);return {current:dataRoot,pending:result.filePaths[0]};},
  networkSettings:()=>({enabled:settings.networkEnabled===true,hasKey:!!secrets['network:tavily'],provider:settings.searchProvider||'tavily',url:settings.searchUrl||''}),
  networkDocs:()=>shell.openExternal('https://docs.tavily.com/documentation/quickstart'),
  networkSave:({enabled,key,clearKey,provider='tavily',url=''})=>{assertIdle();if(!['tavily','searxng'].includes(provider))throw Error('未知搜索服务。');if(provider==='searxng'){const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('请填写不含密码、参数的 HTTP(S) 服务地址。');url=u.href.replace(/\/$/,'');}settings.searchProvider=provider;settings.searchUrl=url;if(key){if(typeof key!=='string'||key.length>4096)throw Error('搜索密钥格式错误。');if(!safeStorage.isEncryptionAvailable())throw Error('系统密钥加密不可用。');secrets['network:tavily']=safeStorage.encryptString(key.trim()).toString('base64');}else if(clearKey)delete secrets['network:tavily'];settings.networkEnabled=enabled===true;store.write('secrets',secrets);store.write('settings',settings);return handlers.networkSettings();},
  modelCatalog:()=>modelCatalog.list(),
  modelCatalogSave:({memberId,models})=>{assertIdle();return modelCatalog.save(memberId,models);},
  modelCatalogFetch:async({memberId})=>{const m=settings.members.find(m=>m.id===memberId);if(!m||m.kind!=='api')throw Error('请选择 API 连接。');return api.models(m);},
  modelCapability:({member})=>require('./model-capabilities.cjs').capability(member||{}),
  providerCatalog:()=>require('./ui/provider-catalog.json'),
  appIcon:async()=> (await app.getFileIcon(process.platform==='darwin'?require('./platform-paths.cjs').appBundle(process.execPath):process.execPath,{size:'large'})).toDataURL(),
  desktopShortcut:()=>{if(!app.isPackaged)throw Error('Please use the portable release to create a shortcut.');return require('./desktop-shortcut.cjs').create({shell,desktop:app.getPath('desktop'),executable:process.execPath});},
  membersState:()=>({members:state().members,active:state().active}),
  deleteRoom:async({id,all=false})=>{assertIdle();const targets=all?[...rooms]:[roomById(id)];const result=await dialog.showMessageBox(win,{type:'warning',title:'确认删除聊天记录',message:all?`删除全部 ${targets.length} 个对话？`:`删除“${targets[0].title}”？`,detail:'将删除聊天内容及关联工作流运行记录，无法撤销。附件文件和已导出的文件会保留。',buttons:['取消','确认删除'],defaultId:0,cancelId:0,noLink:true});assertIdle();if(result.response!==1)return state();const ids=targets.map(r=>r.id);rooms=rooms.filter(r=>!ids.includes(r.id));workflows.purgeRoomRuns(ids);if(!rooms.length)rooms.push(newRoom());saveRooms();fs.copyFileSync(path.join(dataRoot,'rooms.json'),path.join(dataRoot,'rooms.json.bak'));return state();},
  providerDocs:({id})=>{const p=require('./ui/provider-catalog.json')[id];if(!p)throw Error('未知服务商');return shell.openExternal(p.docs);},
  state:()=>state(),
  manualStatus:()=>manual.status(),
  manualCopy:({id})=>{const job=manual.status();if(!job||job.id!==id)throw Error('接力已结束。');clipboard.writeText(job.prompt);return true;},
  manualSubmit:({id,text,filesUploaded})=>{if(manual.pending?.manualFiles?.length&&filesUploaded!==true)throw Error('请先在原网页上传附件，并勾选已上传。');manual.submit(id,text);return true;},
  attachmentsList:({scope})=>attachments.list(scope),
  attachmentsImport:({scope,pages})=>attachments.import(scope,pages),
  attachmentsRemove:({scope,id})=>attachments.remove(scope,id),
  attachmentsEdit:({scope,id,text})=>attachments.edit(scope,id,text),
  attachmentReveal:({id})=>attachments.reveal(id),
  attachmentPreview:({id,index})=>attachments.preview(id,index),
  attachmentsDelivery:({scope})=>settings.members.map(m=>({name:m.name,description:attachmentNote(m,attachments.list(scope))})),
  newRoom:()=>{assertIdle();const r=newRoom();rooms.unshift(r);saveRooms();return r;},
  renameRoom:({id,title})=>{assertIdle();roomById(id).title=String(title).slice(0,100)||'未命名讨论';saveRooms();return state();},
  saveMember:({member,key,clearKey})=>{
    assertIdle();stableMember(member);const clean=validateMember(member);const existing=settings.members.find(x=>x.id===clean.id);
    if(clean.kind==='api'){const c=require('./model-capabilities.cjs').capability(clean);clean.vision=c.status==='supported'||c.status==='unknown'&&existing?.baseUrl===clean.baseUrl&&existing?.model===clean.model&&existing?.format===clean.format&&existing?.vision===true;}
    if(!existing&&settings.members.length>=20)throw Error('最多添加 20 位成员。');
    if(clean.apiLabel!==undefined&&(typeof clean.apiLabel!=='string'||clean.apiLabel.length>60))throw Error('API 名称最多 60 字。');
    if(clean.apiParent&&!settings.members.some(m=>m.id===clean.apiParent&&m.kind==='api'&&m.id!==clean.id&&!m.apiParent&&m.baseUrl===clean.baseUrl&&m.format===clean.format))throw Error('所属成员必须是同地址、同协议的 API 成员。');
    if(key){if(!safeStorage.isEncryptionAvailable())throw Error('系统密钥加密不可用，不能保存密钥。');if(typeof key!=='string'||key.length>4096)throw Error('密钥格式异常。');secrets[clean.id]=safeStorage.encryptString(key.trim()).toString('base64');}
    else if(clearKey||existing?.baseUrl!==clean.baseUrl||clean.kind!=='api')delete secrets[clean.id];
    if(existing)settings.members=settings.members.map(x=>x.id===clean.id?clean:x);else settings.members.push(clean);
    if(clean.apiParent)settings.members=settings.members.map(m=>m.id===clean.apiParent?{...m,apiPool:[...new Set([...(m.apiPool||[]),clean.id])]}:m);
    store.write('secrets',secrets);store.write('settings',settings);return state();
  },
  removeMember:({id})=>{assertIdle();settings.members=settings.members.filter(m=>m.id!==id).map(m=>m.apiPool?{...m,apiPool:m.apiPool.filter(x=>x!==id)}:m);const children=settings.members.filter(m=>m.apiParent===id);if(children.length){const next=children[0].id;settings.members=settings.members.map(m=>m.apiParent===id?{...m,apiParent:m.id===next?undefined:next,...(m.id===next?{apiPool:[...new Set([...(m.apiPool||[]),...children.slice(1).map(x=>x.id)])]}:{})}:m);}delete secrets[id];store.write('settings',settings);store.write('secrets',secrets);return state();},
  models:({id})=>api.models(memberById(id)),
  discoverModels:async({member,key})=>{const m=validateMember({...member,model:'model-list'});if(m.kind!=='api')throw Error('请选择 API 接入。');const saved=settings.members.find(x=>x.id===m.id);if(key!==undefined&&(typeof key!=='string'||key.length>4096))throw Error('密钥格式异常。');const value=key?.trim()||(saved?.baseUrl===m.baseUrl?unlocked(m.id):'');if(!value&&!['localhost','127.0.0.1','[::1]'].includes(new URL(m.baseUrl).hostname))throw Error('请先填写该服务商的 API 密钥。');return new ApiAdapter({getKey:()=>value,fetchImpl:(...args)=>net.fetch(...args)}).models(m);},
  chooseExe:async()=>{const r=await dialog.showOpenDialog(win,{title:'选择可执行程序',properties:['openFile'],...(process.platform==='win32'?{filters:[{name:'可执行程序',extensions:['exe']}]}:{})});return r.canceled?'':r.filePaths[0];},
  probe:async({id})=>{
    const m=memberById(id);
    if(m.kind==='codex')return codex.probe(m);
    if(m.kind==='web'&&m.webTransport==='window')return {connected:!!webConnected(m),message:'网页窗口状态不代表测试成功；请在网页连接向导中发送测试消息。'};
    if(m.kind==='web')return {connected:m.webMode!=='automation'||bridge.connected(id),message:m.webMode!=='automation'?'手动接力：无需扩展，由你在原网站发送并粘贴回复。':bridge.connected(id)?'网页桥已连接；首次发送时会验证输入框和回复区域。':'尚未连接网页桥。'};
    if(m.kind==='api')return {connected:true,models:await api.models(m),message:m.format==='anthropic'?'此协议将在首次发送时验证连接。':'模型列表已读取。'};
    return {connected:fs.existsSync(m.executable),message:'程序路径检查完成；具体输入输出需实际运行验证。'};
  },
  login:({id})=>{assertIdle();return codex.login(memberById(id),u=>{if(new URL(u).protocol!=='https:')throw Error('无效登录地址。');return shell.openExternal(u);});},
  openWeb:({id})=>{const m=memberById(id);if(m.kind!=='web')throw Error('请选择网页成员。');return shell.openExternal(m.url);},
  pair:()=>{clipboard.writeText(JSON.stringify({port:bridge.port,token:bridge.token,members:settings.members.filter(m=>m.kind==='web'&&m.webMode==='automation').map(({id,name,url})=>({id,name,url}))}));return true;},
  extensionFolder:()=>shell.openPath(path.join(sourceRoot,'extension')),
  dataFolder:()=>shell.openPath(dataRoot),
  attach:async({id})=>{
    roomById(id);const result=await attachments.import('room:'+id);if(result.errors.length)emit({type:'failure',error:result.errors.join('\n')});return state();
  },
  removeMaterial:({id,materialId})=>{assertIdle();const r=roomById(id);if(r.materials.find(x=>x.id===materialId)?.attachmentId)attachments.remove('room:'+id,materialId);else{r.materials=r.materials.filter(x=>x.id!==materialId);saveRooms();}return state();},
  export:async({id})=>{const room=roomById(id);return exportDocument({title:room.title,markdown:exportMarkdown(room),dialog,window:win});},
  stop:()=>{engine.stop();workflows?.runner.stop();return true;},
  start:({id,text,memberIds,rounds,mode})=>{
    assertIdle();if(typeof text!=='string'||text.length>20000)throw Error('单条消息上限为 20,000 字符。');
    if(!Array.isArray(memberIds)||!memberIds.length)throw Error('请至少选择一位成员。');
    if(mode!=='discussion'&&mode!=='summary')throw Error('无效讨论模式。');
    if(!Number.isInteger(rounds)||rounds<1||rounds>5)throw Error('轮数范围为 1–5。');
    for(const memberId of memberIds)memberById(memberId);
    const selectedRoom=roomById(id);if(selectedRoom.usageMode==='solo'){memberIds=[selectedRoom.soloMember||memberIds[0]];rounds=1;}const members=settings.members.filter(m=>memberIds.includes(m.id)).map(m=>selectedRoom.usageMode==='solo'&&selectedRoom.soloModel&&['api','codex'].includes(m.kind)?{...m,model:selectedRoom.soloModel}:m);
    for(const m of members){stableMember(m);validateMember(m);if(m.kind==='web'&&m.webMode==='automation'&&!webConnected(m))throw Error(`${m.name} 网页未连接。请打开网页并连接扩展，或暂时取消勾选该成员。`);if(m.kind==='api'&&!secrets[m.id]&&!['localhost','127.0.0.1','[::1]'].includes(new URL(m.baseUrl).hostname))throw Error(`${m.name} 尚未填写 API 密钥。`);}
    const room=roomById(id);const contextStart=room.messages.length;if(room.contextMode==='none'&&!text.trim())throw Error('请填写本次输入');if(!text.trim()&&!room.messages.length)throw Error('请先输入讨论主题。');
    if(text.trim()){room.messages.push({id:randomUUID(),role:'user',name:'你',text:text.trim(),status:'complete',at:new Date().toISOString()});if(room.title==='新的讨论')room.title=text.trim().slice(0,28);saveRooms();}
    engine.run(room,members,{rounds,mode,contextStart,limit:settings.contextLimit}).catch(e=>emit({type:'failure',roomId:id,error:e.message}));return state();
  }
};
if(!primary){app.quit();}
else {
  app.on('second-instance',()=>{win?.show();win?.focus();});
  app.whenReady().then(async()=>{
    store=new Store(dataRoot);settings=store.read('settings',defaults());secrets=store.read('secrets',{});rooms=store.read('rooms',[]);
    if(!rooms.length)rooms.push(newRoom());
    for(const room of rooms)for(const m of room.messages)if(m.status==='running'){m.status='cancelled';m.error='上次程序退出时回复尚未完成；没有自动重发。';}
    fs.mkdirSync(path.join(dataRoot,'workspace'),{recursive:true});saveRooms();
    bridge=new BrowserBridge();await bridge.start();plugins=new (require('./plugins.cjs').Plugins)({root:dataRoot,store,bundled:path.join(__dirname,'web-window.cjs')});webWindow=null;skills=new (require('./skills.cjs').Skills)(store);roleTemplates=require('./role-templates.cjs').roles(store);quickTasks=require('./quick-tasks.cjs').quickTasks(store);modelCatalog=require('./model-catalog.cjs').modelCatalog(store,()=>settings.members);
    const options={cwd:path.join(dataRoot,'workspace'),timeout:settings.timeoutSeconds*1000};
    const network=new NetworkTools({fetchImpl:(...args)=>net.fetch(...args),getSearchKey:()=>unlocked('network:tavily'),getSearchConfig:()=>({provider:settings.searchProvider||'tavily',url:settings.searchUrl||''})});
    api=new ApiAdapter({getKey:unlocked,fetchImpl:(...args)=>net.fetch(...args),timeout:options.timeout,network,isNetworkEnabled:()=>settings.networkEnabled===true});codex=new CodexAdapter(options);terminal=new TerminalAdapter(options);
    attachments=new Attachments({store,root:path.join(dataRoot,'attachments'),BrowserWindow,ipcMain,dialog,shell,window:()=>win,assertIdle,onChange:(scope,list)=>{if(scope.startsWith('room:')){const r=roomById(scope.slice(5));r.materials=[...r.materials.filter(m=>!m.attachmentId),...list];saveRooms();}}});
    const routedApi=new (require('./api-connections.cjs').ApiConnections)({getMembers:()=>settings.members.filter(m=>m.kind!=='api'||secrets[m.id]||['localhost','127.0.0.1','[::1]'].includes(new URL(m.baseUrl).hostname)),getCatalog:()=>modelCatalog.list(),send:p=>api.send(p)});
    const dispatch=async p=>{stableMember(p.member);if(p.member.kind==='api'&&require('./model-capabilities.cjs').capability(p.member).status==='supported')p={...p,member:{...p.member,vision:true}};if(!p.skillsPrepared)p=skills.prepare(p);p=attachments.prepare(p);const m=p.member;const result=await (m.kind==='codex'?codex:m.kind==='api'?routedApi:m.kind==='terminal'?terminal:m.webMode==='automation'?(m.webTransport==='window'?webWindow:bridge):manual).send(p);return {...result,skills:p.skills};};
    engine=new Discussion({getAdapter:()=>({send:dispatch}),persist:saveRooms,emit});
    workflows=createWorkflows({store,prepare:p=>skills.prepare(p),getSkillStamp:()=>JSON.stringify(skills.list()),getMembers:()=>settings.members,getAttachments:id=>attachments.list('workflow:'+id),assertIdle,dialog,window:()=>win,emit,onRun:(run,persist)=>{if(!run.roomId)return;const room=rooms.find(r=>r.id===run.roomId);if(!room)return;syncRunToRoom(run,room,emit,settings.members);if(persist)saveRooms();if(run.status!=='running')emit({type:'idle',roomId:room.id});},
      preflight:m=>{stableMember(m);validateMember(m);if(m.kind==='api'&&!secrets[m.id]&&!['localhost','127.0.0.1','[::1]'].includes(new URL(m.baseUrl).hostname))throw Error(m.name+' 尚未填写 API 密钥。');if(m.kind==='web'&&m.webMode==='automation'&&!webConnected(m))throw Error(m.name+' 网页桥未连接。');},
      send:dispatch});
    Object.assign(handlers,workflows.handlers);
    for(const [name,fn]of Object.entries(handlers))ipcMain.handle('roundtable:'+name,async(event,args={})=>{
      if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('无权调用。');
      try{return {ok:true,value:await fn(args)};}catch(e){return {ok:false,error:e.message};}
    });
    win=new BrowserWindow({width:1260,height:850,minWidth:950,minHeight:650,show:!qa,backgroundColor:'#f6f6f0',title:'同桌 AI · 讨论室',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    require('./window-controls.cjs').attach(win);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
    win.on('close',()=>{engine.stop();workflows?.runner.stop();webWindow?.close();});
    await win.loadFile(path.join(__dirname,'ui/index.html'));
    if(location.error)dialog.showErrorBox('数据目录',location.error);
    if(qa){global.__qa={win,engine,store,settings,rooms,bridge,handlers,discoverCodex,codex};}
  }).catch(e=>{if(qa)console.error('QA startup failed:',e);else dialog.showErrorBox('同桌 AI 启动失败',e.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{engine?.stop();workflows?.runner.stop();bridge?.close();webWindow?.close();});
}
