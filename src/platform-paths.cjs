const path=require('node:path');
function storageRoot({platform=process.platform,packaged,executable,sourceRoot,appData,qa=false,temp}){
  if(qa)return path.join(temp,'ai-roundtable-qa-'+process.pid);
  if(platform==='darwin')return path.join(appData,'AI Roundtable');
  return packaged?path.dirname(executable):sourceRoot;
}
function appBundle(executable){
  const root=path.resolve(executable,'../../..');
  if(!root.endsWith('.app'))throw Error('Not a macOS application bundle');
  return root;
}
module.exports={storageRoot,appBundle};
