const fs=require('node:fs'),path=require('node:path');
const pointer=root=>path.join(root,'data-location.json');
function read(root){try{return JSON.parse(fs.readFileSync(pointer(root),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
function write(root,value){const file=pointer(root);fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);}
function validate(source,destination){
 if(!path.isAbsolute(destination))throw Error('请选择绝对路径。');
 const src=fs.realpathSync(source),dst=fs.realpathSync(destination);
 const inside=(a,b)=>{const r=path.relative(a,b);return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
 if(inside(src,dst)||inside(dst,src))throw Error('新目录不能是当前目录、其父目录或子目录。');
 if(fs.readdirSync(dst).length)throw Error('请选择一个空文件夹，避免覆盖已有文件。');
 return dst;
}
function schedule(root,source,destination){const dst=validate(source,destination);write(root,{path:source,pending:dst});return dst;}
function resolve(root){
 const cfg=read(root),source=cfg.path||path.join(root,'data');
 if(!cfg.pending)return {path:source};
 try{
  const dst=validate(source,cfg.pending);
  // Copy only app-owned durable data. Chromium caches and locks remain at the old location.
  for(const entry of fs.readdirSync(source,{withFileTypes:true})){
   if(entry.isSymbolicLink())throw Error('数据目录含符号链接，请人工迁移。');
   if(entry.isFile()&&/\.json(?:\.bak)?$/.test(entry.name))fs.copyFileSync(path.join(source,entry.name),path.join(dst,entry.name),fs.constants.COPYFILE_EXCL);
   if(entry.isDirectory()&&['attachments','workspace','Local Storage'].includes(entry.name))fs.cpSync(path.join(source,entry.name),path.join(dst,entry.name),{recursive:true,errorOnExist:true,force:false,filter:p=>{if(fs.lstatSync(p).isSymbolicLink())throw Error('数据含符号链接，请人工迁移。');return true;}});
  }
  write(root,{path:dst});return {path:dst};
 }catch(e){write(root,{path:source});return {path:source,error:'数据迁移未完成，继续使用原目录；原数据已保留。请检查目标目录后重试。\n'+e.message};}
}
module.exports={resolve,schedule,read};
