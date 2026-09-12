const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const EXTENSIONS=['png','jpg','jpeg','webp','bmp','gif','pdf','docx','xlsx','pptx','txt','md','csv','tsv','json','tex','py','js','ts','html','css','yaml','yml','xml','log'];
const visualMode=m=>m.kind==='codex'||(m.kind==='api'&&m.vision===true);
function attachmentNote(m,list){return list.map(a=>`附件「${a.name}」：${a.details||'文本'}。${a.visualCount?(visualMode(m)?`已附带 ${a.visualCount} 张图像 / 页面图。`:m.kind==='web'&&m.webMode!=='automation'?'原文件需用户在网页另行上传；在用户上传前不能声称看过图片。':'本成员仅收到提取文字，没有收到图像，不能声称看过图片或页面布局。'):'仅提取文字，不包含原文件的完整排版或嵌入图片。'}${(a.warnings||[]).join(' ')}`).join('\n');}
class Attachments{
 constructor({store,root,BrowserWindow,ipcMain,dialog,shell,window,onChange,assertIdle}){Object.assign(this,{store,root,BrowserWindow,ipcMain,dialog,shell,window,onChange,assertIdle});this.registry=store.read('attachments',{items:{},scopes:{}});this.busy=false;}
 scope(s){if(typeof s!=='string'||! /^(room|workflow):[a-zA-Z0-9_-]{1,80}$/.test(s))throw Error('无效附件范围。');return s;}
 list(s){this.scope(s);return (this.registry.scopes[s]||[]).map(id=>this.public(this.registry.items[id])).filter(Boolean);}
 public(a){if(!a)return null;const {images,source,...rest}=a;return {...rest,visualCount:images.length,imagePages:images.map(x=>x.page)};}
 save(s){this.store.write('attachments',this.registry);this.onChange(s,this.list(s));}
 async parse(file,pages){
  const win=new this.BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'parser/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'attachment-parser-'+randomUUID()}});
  win.webContents.session.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!['file:','data:','blob:'].includes(new URL(d.url).protocol)}));win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  let listener,timer;try{await win.loadFile(path.join(__dirname,'parser/index.html'));return await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('文件解析超时，请减少 PDF 页数或缩小文件。')),90000);listener=(e,r)=>{if(e.sender!==win.webContents)return;r?.ok?resolve(r.result):reject(Error(r?.error||'文件解析失败。'));};this.ipcMain.on('parsed-file',listener);win.webContents.once('render-process-gone',()=>reject(Error('文件解析进程异常退出。')));win.webContents.send('parse-file',{name:path.basename(file),bytes:fs.readFileSync(file),pages});});}finally{clearTimeout(timer);if(listener)this.ipcMain.removeListener('parsed-file',listener);if(!win.isDestroyed())win.destroy();}
 }
 async import(s,pages='1-5'){
  this.assertIdle();this.scope(s);this.busy=true;const errors=[];
  try{const result=await this.dialog.showOpenDialog(this.window(),{title:'添加附件：图片、PDF、Office、文本',properties:['openFile','multiSelections'],filters:[{name:'支持的附件',extensions:EXTENSIONS}]});if(result.canceled)return {files:this.list(s),errors};const current=this.registry.scopes[s]||[];if(current.length+result.filePaths.length>10)throw Error('每个讨论 / 工作流最多添加 10 个附件。');
   for(const file of result.filePaths){try{const size=fs.statSync(file).size,ext=path.extname(file).slice(1).toLowerCase();if(!EXTENSIONS.includes(ext))throw Error('格式暂不支持；旧版 DOC/XLS/PPT 请先另存为 DOCX/XLSX/PPTX。');if(size>25*1024*1024)throw Error('单个附件上限为 25 MB。');const parsed=await this.parse(file,pages);if(typeof parsed.text!=='string'||parsed.text.length>20000||!Array.isArray(parsed.images)||parsed.images.length>12)throw Error('解析结果超出范围。');
    const id=randomUUID(),dir=path.join(this.root,id);fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(file,path.join(dir,'source.'+ext));const images=[];let bytes=0;for(const [i,img]of parsed.images.entries()){if(!/^data:image\/jpeg;base64,/.test(img.data))throw Error('无效图像结果。');const data=Buffer.from(img.data.split(',')[1],'base64');bytes+=data.length;if(bytes>24*1024*1024)throw Error('页面图片过大，请减少页数。');const name=`page-${i+1}.jpg`;fs.writeFileSync(path.join(dir,name),data);images.push({file:name,mime:'image/jpeg',page:img.page||null});}
    this.registry.items[id]={id,attachmentId:id,name:path.basename(file),size,text:parsed.text,details:parsed.details,warnings:parsed.warnings,source:'source.'+ext,images};current.push(id);
   }catch(e){errors.push(path.basename(file)+'：'+e.message);}}
   this.registry.scopes[s]=current;this.save(s);return {files:this.list(s),errors};
  }finally{this.busy=false;}
 }
 remove(s,id){this.assertIdle();this.scope(s);this.registry.scopes[s]=(this.registry.scopes[s]||[]).filter(x=>x!==id);this.save(s);return this.list(s);}
 edit(s,id,text){this.assertIdle();if(!this.list(s).some(a=>a.id===id))throw Error('附件不存在。');if(typeof text!=='string'||text.length>20000)throw Error('文字节选上限为 20,000 字符。');const a=this.registry.items[id];a.text=text;if(!a.warnings.includes('文字节选由用户编辑。'))a.warnings.push('文字节选由用户编辑。');this.save(s);return this.list(s);}
 reveal(id){const a=this.registry.items[id];if(!a)throw Error('附件不存在。');this.shell.showItemInFolder(path.join(this.root,id,a.source));return true;}
 preview(id,index){const a=this.registry.items[id];if(!a||!Number.isInteger(index)||!a.images[index])throw Error('图片页不存在。');return 'data:image/jpeg;base64,'+fs.readFileSync(path.join(this.root,id,a.images[index].file)).toString('base64');}
 prepare(p){const list=p.attachments||[];if(!list.length)return p;const images=[];for(const a of list){const record=this.registry.items[a.attachmentId||a.id];if(!record)throw Error(`附件「${a.name}」已不可用，请重新添加。`);if(visualMode(p.member))for(const img of record.images)images.push({path:path.join(this.root,record.id,img.file),mime:img.mime});}
  if(images.length>12)throw Error('一次请求最多发送 12 张图像 / 页面图，请减少附件或 PDF 页数。');
  const prompt=p.prompt+'\n\n【附件实际接收范围】\n'+attachmentNote(p.member,list)+'\n\n'+list.map(a=>`【附件文字：${a.name}】\n${a.text||'[未提取到文字；请根据实际接收范围判断能否读取图像。]'}`).join('\n\n');
  if(prompt.length>60000)throw Error('附件文字与上下文合计超过 60,000 字符，请在附件预览中缩短节选。');return {...p,prompt,images,manualFiles:p.member.kind==='web'?list.map(a=>({id:a.id,name:a.name})):[]};
 }
}
module.exports={Attachments,attachmentNote,visualMode,EXTENSIONS};
