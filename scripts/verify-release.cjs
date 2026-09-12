const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const stages=fs.readdirSync(path.join(root,'dist')).filter(n=>n.startsWith('release-'));
assert(stages.length,'No release staging directory');
const denied=/(^|\/)(?:data|instance|qa|node_modules|\.git|Local Storage|Session Storage)(\/|$)|(?:^|\/)(?:secrets|settings|rooms|data-location)\.json$|\.(?:key|pem|log|bak)$/i;
const credential=/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{28,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);assert(!e.isSymbolicLink(),'Symlink in release');return e.isDirectory()?walk(p):[p];});}
for(const stage of stages){
 const dir=path.join(root,'dist',stage);
 for(const sub of ['source','AI-Roundtable-win-x64']){
  let count=0;
  for(const file of walk(path.join(dir,sub))){const rel=path.relative(path.join(dir,sub),file).replaceAll('\\','/');assert(!denied.test(rel),`Private/runtime data path: ${rel}`);if(/\.(?:cjs|js|json|md|txt|html|css|ps1|yml)$/.test(file)&&!rel.includes('third-party/')){const s=fs.readFileSync(file,'utf8');assert(!credential.test(s),`Potential credential in ${rel}`);assert(!/[A-Z]:[\\/]Users[\\/][A-Za-z0-9_-]+[\\/]/i.test(s),`Personal path in ${rel}`);}count++;}
  console.log(`${stage}/${sub}: ${count} files; prohibited paths and credential patterns absent`);
 }
}
