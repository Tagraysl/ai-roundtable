const path=require('node:path'),fs=require('node:fs');
function create({shell,desktop,executable,platform=process.platform}){
 if(platform==='darwin'){
  const target=require('./platform-paths.cjs').appBundle(executable);
  for(let i=0;i<100;i++){const link=path.join(desktop,`AI Roundtable${i?' ('+(i+1)+')':''}.app`);
   try{fs.symlinkSync(target,link,'dir');return link;}catch(e){if(e.code!=='EEXIST')throw e;if(fs.lstatSync(link).isSymbolicLink()&&fs.readlinkSync(link)===target)return link;}
  }throw Error('No available shortcut name.');
 }
 if(platform!=='win32')throw Error('Desktop shortcuts are supported on Windows and macOS.');
 for(let i=0;i<100;i++){
  const link=path.join(desktop,`AI Roundtable${i?' ('+(i+1)+')':''}.lnk`);
  if(fs.existsSync(link)){try{if(path.resolve(shell.readShortcutLink(link).target).toLowerCase()!==path.resolve(executable).toLowerCase())continue;}catch{continue;}}
  if(!shell.writeShortcutLink(link,'create',{target:executable,cwd:path.dirname(executable),icon:executable,iconIndex:0,description:'AI Roundtable'}))throw Error('Could not create desktop shortcut.');
  return link;
 }
 throw Error('No available shortcut name.');
}
module.exports={create};
