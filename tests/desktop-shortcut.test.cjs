const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {create}=require('../src/desktop-shortcut.cjs');
test('shortcut quotes through structured API, preserves unrelated link and uses executable icon',()=>{
 const desktop=fs.mkdtempSync(path.join(os.tmpdir(),'roundtable-link-'));
 try{fs.writeFileSync(path.join(desktop,'AI Roundtable.lnk'),'other');const executable=path.join(desktop,'folder with spaces','AI-Roundtable.exe');let captured;
 const shell={readShortcutLink:()=>({target:'unrelated.exe'}),writeShortcutLink:(p,mode,options)=>{captured={p,mode,options};return true;}};
 const result=create({shell,desktop,executable,platform:'win32'});assert.equal(path.basename(result),'AI Roundtable (2).lnk');assert.equal(captured.options.target,executable);assert.equal(captured.options.icon,executable);assert.equal(captured.options.cwd,path.dirname(executable));assert.equal(fs.readFileSync(path.join(desktop,'AI Roundtable.lnk'),'utf8'),'other');
 }finally{fs.rmSync(desktop,{recursive:true,force:true});}
});
