const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['state','manualStatus','manualCopy','manualSubmit','newRoom','renameRoom','saveMember','removeMember','models','chooseExe','probe','login','openWeb','pair','extensionFolder','dataFolder','attach','removeMaterial','export','stop','start']);
for(const name of ['workflowState','workflowTemplate','workflowSave','workflowDelete','workflowValidate','workflowDirectory','workflowGate','workflowStart','workflowExport','workflowImport','workflowExportRun'])allowed.add(name);
for(const name of ['attachmentsList','attachmentsImport','attachmentsRemove','attachmentsEdit','attachmentReveal','attachmentsDelivery'])allowed.add(name);
allowed.add('attachmentPreview');
allowed.add('discoverModels');
allowed.add('providerCatalog');
allowed.add('providerDocs');
allowed.add('appIcon');for(const n of ['modelCatalog','modelCatalogSave','modelCatalogFetch'])allowed.add(n);allowed.add('roomWorkflowRetry');for(const n of ['quickTasks','quickTaskSave','quickTaskDelete'])allowed.add(n);for(const n of ['roleTemplates','roleTemplateSave','roleTemplateDelete'])allowed.add(n);for(const n of ['skillsList','skillsSave','skillsDelete','skillsImport'])allowed.add(n);allowed.add('webWindowDetect');allowed.add('pluginStatus');allowed.add('pluginChange');for(const n of ['webWindowOpen','webWindowPick','webWindowTest'])allowed.add(n);allowed.add('nativeLanguage');
allowed.add('roomOptions');allowed.add('roomHandoff');allowed.add('roomAdoptAttachment');allowed.add('dataLocation');allowed.add('dataLocationChoose');
allowed.add('deleteRoom');
allowed.add('desktopShortcut');
allowed.add('steeringStatus');
allowed.add('steer');
allowed.add('skipMember');
allowed.add('runtimeStatus');
allowed.add('workflowDeleteAll');
for(const name of ['roomWorkflowSet','roomWorkflowStart'])allowed.add(name);
for(const name of ['networkSettings','networkSave','networkDocs'])allowed.add(name);
contextBridge.exposeInMainWorld('roundtable',{
  call:async(name,args={})=>{if(!allowed.has(name))throw Error('未知操作');const r=await ipcRenderer.invoke('roundtable:'+name,args);if(!r.ok)throw Error(r.error);return r.value;},
  subscribe:fn=>{ipcRenderer.on('roundtable:event',(_,e)=>fn(e));}
});
